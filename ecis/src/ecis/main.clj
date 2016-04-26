(ns ecis.main
  (:require
   [clojure.java.io :as io]
   [clojure.string :as string]
   [org.httpkit.server :as httpserver]
   [clj-jgit.porcelain :as porcelain]  
   [clj-json.core :as json]
   [gniazdo.core :as ws])
  (:import [java.io File BufferedWriter OutputStreamWriter BufferedReader InputStreamReader]
           [org.apache.log4j.BasicConfigurator])
  (:import (org.apache.log4j Level Logger PropertyConfigurator)))


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

;;     (with-open [stdout (.getInputStream proc)
;;                stderr (.getErrorStream proc)]
;;      (let [out (future (io/copy stdout *out*))
;;            err (future (io/copy stderr *out*))

(defn connect-to-eve [station user bag]
  (let [handlers (atom {})
        input #(prn 'received %)
        target (str "ws://" station)
        ;; just bury any errors
        sock (try (ws/connect target :on-receive input)
                  (catch Exception e nil))]
    (println "socko" sock)
    (if sock [sock handlers] sock)))
    


(defn eve-query [s q handler]
  (let [tag (gensym "q")
        q (format-json {"type" "query"
                        "query"  q
                        "id" tag})]
    (println "query" q)
    (ws/send-msg (s 0) q)
    (swap! (s 1) assoc tag handler)
    [s tag]))
  

(defn eve-close [q]
  (let [m (format-json {"type" "close"
                             "id" (q 1)})]
    (println "closerino" m)
    (ws/send-msg ((q 0) 0) m)))

  
(defn eve-insert [s e a v]
  (eve-close (eve-query s (str "(query [] (insert-fact! " 
                               e " " 
                               a " " 
                               v "))")
                        ;; fix signature
                        (fn []))))

(defn subprocess [path]
  (let [cmd ["/usr/local/bin/lein" "run" "-p" "8083"]
        proc (.exec (Runtime/getRuntime) 
                    ^"[Ljava.lang.String;" (into-array cmd)
                    nil ;; (into-array String [])
                    (File. path))
        out (new BufferedReader (new InputStreamReader (.getInputStream proc)))]
        
    (println "i think i started a process")
    (.start (Thread. (fn [] (println (.readLine out)))))
                       
    [(new BufferedWriter (new OutputStreamWriter (.getOutputStream proc))) (future (.waitFor proc))]))


(import java.io.Reader)

(def charset (map char (concat (range 48 58) (range 66 92) (range 97 123))))

;; probably also should take a sha
(defn checkout-repository [url branch]
  (let [pathname (apply str "/tmp/" (repeatedly 20 #(rand-nth charset)))]
       (porcelain/git-clone url pathname branch)
       pathname))

 
(defn run-test [branch]
  (let [path
        (checkout-repository "https://github.com/witheve/Eve.git" "git")
        s (atom nil)
        start "(load \"examples/harness.e\")\n"
        p (subprocess (str path "/server"))]
    (Thread/sleep 3000)
    (reset! s (connect-to-eve "localhost:8083" 0 0))
    (when (not @s)
      (Thread/sleep 3000)
      (reset! s (connect-to-eve "localhost:8083" 0 0)))
    (println "foo" start)
    (when @s
      (eve-query @s "(query [test success] (fact _ :tag \"test-run\" :result success :test))" (fn [])))
    (.write (p 0) start)
    (.flush (p 0))))

    
;; the websocket input guy   
(defn input-handler [request]
  (let [parsed (json/parsed-seq (clojure.java.io/reader (:body request) :encoding "UTF-8"))]
    (println (parsed "pull_request"))))


;; webhook input
(defn serve [port]
  (println (str "Serving on localhost:" port "/repl"))
  (try
    (httpserver/run-server input-handler {:port port})
    (catch Exception e (println (str "caught exception: " e (.getMessage e))))))

(defn -main [& args] 
  (org.apache.log4j.BasicConfigurator/configure) 
  (.setLevel (Logger/getRootLogger) Level/OFF)
  (run-test "git")
;;  (let [k (connect-to-eve "127.0.0.1:8081" 0 0)]
;;    (eve-insert k "joeoy" :loves "salley"))

  (when (> (count args) 0) 
    (subprocess (first args)))
  (serve 8080))


