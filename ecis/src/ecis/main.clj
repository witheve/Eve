(ns ecis.main
  (:require
   [clojure.java.io :as io]
   [clojure.string :as string]
   [org.httpkit.server :as httpserver]
   [clojure.stacktrace :refer [print-stack-trace]]
   [clj-jgit.porcelain :as porcelain]  
   [clojure.walk :as walk]
   [clj-json.core :as json]
   [clojure.pprint :refer [pprint]]
   [gniazdo.core :as ws])
  (:import [java.io File BufferedWriter OutputStreamWriter BufferedReader InputStreamReader Reader]
           [org.apache.log4j BasicConfigurator Level Logger PropertyConfigurator]))

(defn query-string [obj]
  (pr-str (walk/prewalk (fn [cur]
                          (if-not (symbol? cur)
                            cur
                            (symbol (name cur))))
                        obj)))

(defn check-query [test] 
  (query-string `(query [result]
                   (fact expected :tag "expected" :test ~test)
                   (fact run :tag "result" :test ~test)
                   (fact-btu expected attr val)
                   (fact-btu run attr val)
                   (= actual (sum 1))
                   (query [desired]
                          (fact expected :tag "expected" :test ~test)
                          (fact-btu expected attr val)
                          (= desired (sum 1)))
                   (choose [actual desired result]
                           (query
                            (= actual desired)
                            (= result true))
                           (query
                            (= result false))))))


(def server "localhost:8081")
 
(defn delete-recursively [fname]
  (let [func (fn [func f]
               (when (.isDirectory f)
                 (doseq [f2 (.listFiles f)]
                   (func func f2)))
               (clojure.java.io/delete-file f))]
    (func func (clojure.java.io/file fname))))

(defn quotify [x] (str "\"" (string/replace (string/replace x "\n" "\\n") "\"" "\\\"") "\""))

(defn format-json [x]
  (condp #(%1 %2) x
    string? (quotify x)
    keyword? x ;;@NOTE: should this coerce to string?
    symbol? (quotify x)
    number? (if (integer? x)
              x
              (double x)) ;; @FIXME: This needs to be bigdec
    map? (str "{" (reduce-kv (fn [b k v] (str b (if (> (count b) 0) ", ") (format-json k) ":" (format-json v))) "" x) "}")
    coll? (str "[" (string/join "," (map format-json x)) "]")
    nil? "null"
    x))


;; shutdown handler
(defn connect-to-eve [station user bag shutdown]
  (let [handlers (atom {})
        input (fn [x] 
                (try (let [_ (println "incoming!" x)
                           j (json/parse-string x)
                           h (@handlers (symbol (j "id")))]
                       (println "input" (j "type"))
                       (condp = (j "type")
                                "result" (h (j "insert"))
                                "close" (h nil)
                                true))
                   (catch Exception e (print-stack-trace e))))
       
        target (str "ws://" station)
        ;; just bury any errors
        sock (try (ws/connect target :on-receive input :on-close (fn [x s]
                                                                   (println "ws close" s)
                                                                   shutdown))
                  (catch Exception e (println "websocket exception" e)))]
    (if sock [sock handlers] sock)))
    

(defn disconnect-from-eve [d]
    (ws/close (d 0)))


(defn eve-query [s q handler]
  (println "evo quero" q)
  (let [tag (gensym "q")
        q (format-json {"type" "query"
                        "query"  q
                        "id" tag})]
    (ws/send-msg (s 0) q)
    (swap! (s 1) assoc tag handler)
    [s tag]))
  

(defn eve-close [q]
  (let [m (format-json {"type" "close"
                             "id" (q 1)})]
    (ws/send-msg ((q 0) 0) m)))

  
(defn eve-insert [s eavs]
  (let [q (str "(query" (map #(str "(insert-fact! " 
                          (nth %1 0) " " 
                          (nth %1 1) " " 
                          (nth %1 2) ")") eavs)
               ")")]
    (println "sending" q)
    (eve-close (eve-query s q (fn [x] ())))))


(defn eve-synchronous-query [s q]
  (let [p (promise)
        results (atom ())
        h (fn [x] (if x (swap! results conj x)
                      (deliver p true)))]
    (eve-close (eve-query s q h))
    @p
    results))


(defn subprocess [path]
  (let [cmd ["/usr/local/bin/lein" "run" "-t" "-p" "8083"]
        proc (.exec (Runtime/getRuntime) 
                    ^"[Ljava.lang.String;" (into-array cmd)
                    nil ;; (into-array String [])
                    (File. path))
        out (new BufferedReader (new InputStreamReader (.getInputStream proc)))
        err (new BufferedReader (new InputStreamReader (.getErrorStream proc)))]

    (.start (Thread. (fn [] (trampoline (fn self [] (let [x (.readLine out)] (when x (println x) self)))))))
    (.start (Thread. (fn [] (trampoline (fn self [] (let [x (.readLine err)] (when x (println x) self)))))))
    
    [(new BufferedWriter (new OutputStreamWriter (.getOutputStream proc))) (future (.waitFor proc))]))


(def charset (map char (concat (range 48 58) (range 66 92) (range 97 123))))

(defn checkout-repository [url branch]
  (let [pathname (apply str "/tmp/" (repeatedly 20 #(rand-nth charset)))]
       (porcelain/git-clone-full url pathname "origin" branch)
       pathname))

 
(defn tree-to-facts [m] 
  (let [facts (atom ())
        descend (fn descend [id m] 
                  (doseq [k (keys m)]
                    (let [v (m k)
                          f (fn [x] (swap! facts conj (list id (keyword k) x)))]
                      (if (= (type v) clojure.lang.PersistentArrayMap )
                        (let [sub (gensym "subflatto")]
                          (descend sub v)
                          (f sub))
                        (f v)))))]
    (descend (gensym "flatto") m)
    @facts))


(defn run-single-test [child directory name facts]
  (let [completion (fn [x] (swap! facts assoc name x))
        body (slurp (str directory "/server/tests/" name ".e"))
        forms (read-string (str \( body "\n" \)))
        _ (doseq [i forms] 
            (println "formi" (str i))
            (eve-synchronous-query child (str i)))
        r (eve-synchronous-query child (check-query name))]
    (println "test results" name r)))


(defn run-test [url branch facts]
  (println "start test" url branch facts)
  (let [path (checkout-repository url branch)
        s (atom nil)
        p (subprocess (str path "/server"))
        database (connect-to-eve "localhost:8081" 0 0 (fn [] ()))
        results (atom facts)]

    (Thread/sleep 6000)
    
    (reset! s (connect-to-eve "localhost:8083" 0 0 (fn [] (println "child failure"))))

    (when (not @s)
      (Thread/sleep 3000)
      (reset! s (connect-to-eve "localhost:8083" 0 0 (fn [] (println "child failure")))))
    
    (if @s
      (let [d (clojure.java.io/file (str path "/server/tests"))]
        (doseq [i (file-seq d)]
          (let [leaf (last (string/split (str i) #"/"))
                leaf (first (string/split leaf #"."))]
            ;; aw, comon, what the hell
            (when (not= leaf "tests")
              (println "test" leaf)
              (run-single-test @s path leaf results)))))
      (swap! assoc results :status "failure"))

    (try 
     (.write (p 0) "(exit)\n")
     (.flush (p 0))
     (catch Exception e nil))
    (eve-insert @database (tree-to-facts @results))
    (disconnect-from-eve @database)
    (println "test lein exit" @(p 1))
    (delete-recursively path)))

    
;; the websocket input guy   
(defn input-handler [request]
  (let [parsed (json/parsed-seq (clojure.java.io/reader (:body request) :encoding "UTF-8"))
        a (first parsed)
        _ (pprint a)
        pr (a "pull_request")]
    (when (and pr (= (get-in pr ["state"]) "open"))
      ;; [pull-request mergable] false
      (run-test (get-in a ["repository" "git_url"])
                (get-in pr ["head" "ref"])
                {:user (get-in pr ["user" "login"])
                 :tag "test"
                 :number (get-in a ["number"])
                 :sha (get-in pr ["head" "sha"])
                 }))
    {:body "thanks"}))

;; webhook input
(defn serve [port]
  (println (str "Serving on localhost:" port "/repl"))
  (try
    (httpserver/run-server input-handler {:port port})
    (catch Exception e (println (str "caught exception: " e (.getMessage e))))))

(defn -main [& args] 
  (org.apache.log4j.BasicConfigurator/configure) 
  (.setLevel (Logger/getRootLogger) Level/OFF)

;;  (let [k (connect-to-eve "127.0.0.1:8081" 0 0)]
;;    (eve-insert k "joeoy" :loves "salley"))

  (when (> (count args) 0) 
    (subprocess (first args)))
  (serve 8080))


