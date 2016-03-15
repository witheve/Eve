(ns server.jsclient
  (:require
   [org.httpkit.server :as httpserver]
   [clojure.data.json :as json]
   [server.db :as db]
   [server.edb :as edb]
   [server.repl :as repl]
   [server.exec :as exec]
   [server.compiler :as compiler]
   [server.smil :as smil]
   [clojure.string :as string])) 

(def bag (atom 10))
;; ok, this is a fucked up rewrite right now. take a parameteric
;; term, use it as the return, and strip it off

(defn quotify [x] (str "\"" x "\""))

(defn format-vec [x]
  (str "[" (string/join "," x) "]"))


(defn format-message [map]
  (let [r (str "{" (reduce (fn [b [k v]] (str b (if (> (count b) 0) ", " b) (quotify k) ":" v))  "" map) "}")]
    (println "message" r)
    r))


(defn start-query [d query id connection]
  (let [keys (second query)
        results (atom ())
        send-error (fn [x]
                     (httpserver/send! connection (format-message {"type" (quotify "error")
                                                                   "cause" x
                                                                   "id" id})))
        send-flush (fn []
                     (println @results (type @results))
                     (httpserver/send! connection (format-message {"type" (quotify "result")
                                                                   "fields" (format-vec (map quotify keys))
                                                                   "values" (format-vec @results)
                                                                   "id" (quotify id)}))
                     (swap! results (fn [x] ())))
        
        form  (repl/form-from-smil query)
        prog (compiler/compile-dsl d @bag form)
        e (exec/open d prog (fn [op tuple]
                              (condp = op
                                'insert (swap! results conj tuple)
                                'flush (send-flush)
                                'error (send-error (str tuple)))))]
    (e 'insert [])
    (e 'flush [])))


(defn handle-connection [d channel]
  ;; this seems a little bad..the stack on errors after this seems
  ;; to grow by one frame of org.httpkit.server.LinkingRunnable.run(RingHandler.java:122)
  ;; for every reception. i'm using this interface wrong or its pretty seriously
  ;; damaged
  
  (httpserver/on-receive
   channel
   (fn [data]
     ;; create relation and create specialization?
     (let [input (json/read-str data)
           query (input "query")
           qs (if query (smil/unpack d (read-string query)) nil)
           t (input "type")]
       (cond
         (and (= t "query")  (= (first qs) 'query)) (start-query d qs (input "id") channel)
         (and (= t "query")  (= (first qs) 'define!))
         (do
           (repl/define d qs)
           (httpserver/send! channel (format-message {"type" (quotify "result")
                                                                   "fields" "[]"
                                                                   "values" "[]"
                                                                   "id" (quotify (input "id"))})))
         ;; should some kind of error
         :else
         (println "jason, wth", input))))))


;; @NOTE: This is trivially exploitable and needs to replaced with compojure or something at some point
(defn serve-static [channel uri]
  (let [prefix (str (.getCanonicalPath (java.io.File. ".")) "/../")]
    (httpserver/send! channel
                      {:status 200
                       :headers {"Expires" "0"
                                 "Cache-Control" "no-cache, private, pre-check=0, post-check=0, max-age=0"
                                 "Pragma" "no-cache"
                                 }
                       :body (slurp (str prefix uri))})))

(defn async-handler [db content]
  
  (fn [ring-request]
    (httpserver/with-channel ring-request channel    ; get the channel
      (if (httpserver/websocket? channel) 
        (handle-connection db channel)
        (condp = (second (string/split (ring-request :uri) #"/"))
          ;;(= (ring-request :uri) "/favicon.ico") (httpserver/send! channel {:status 404})
          "bin" (serve-static channel (ring-request :uri))
          "css" (serve-static channel (ring-request :uri))
          "repl" (serve-static channel "repl.html")
          (httpserver/send! channel {:status 404}))))))


(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(def server (atom nil))

(defn serve [db address]
  ;; its really more convenient to allow this to be reloaded
  ;;  (let [content
  ;;        (apply str (map (fn [p] (slurp (clojure.java.io/file (.getPath (clojure.java.io/resource p)))))
  ;;                        '("translate.js"
  ;;                          "db.js"
  ;;                          "edb.js"
  ;;                          "svg.js"
  ;;                          "websocket.js")))]
  ;; xxx - wire up address
  (when-not (nil? @server)
    (@server :timeout 0))
  (reset! server
          (try (httpserver/run-server (async-handler db "<http><body>foo</body><http>") {:port 8081})
               (catch Exception e (println (str "caught exception: " e (.getMessage e)))))))
