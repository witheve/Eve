(ns server.jsclient
  (:require
   [clojure.stacktrace :refer [print-stack-trace]]
   [org.httpkit.server :as httpserver]
   [ring.middleware.file :refer [wrap-file]]
   [ring.middleware.content-type :refer [wrap-content-type]]
   [clojure.data.json :as json]
   [server.db :as db]
   [server.edb :as edb]
   [server.repl :as repl]
   [server.exec :as exec]
   [server.compiler :as compiler]
   [server.smil :as smil]
   [clojure.string :as string]
   [clojure.pprint :refer [pprint]]))

(defonce clients (atom {}))
(defonce server (atom nil))

(def DEBUG true)
(defonce bag (atom 10))

(defn quotify [x] (str "\""
                       (-> x
                           (string/replace "\r\n" "\\n")
                           (string/replace "\n" "\\n")
                           (string/replace  "\"" "\\\""))
                       "\""))

(defn format-json [x]
  (condp #(%1 %2) x
    string? (quotify x)
    keyword? (quotify x) ;;@NOTE: should this coerce to string?
    symbol? (quotify x)
    number? (if (integer? x)
              x
              (double x)) ;; @FIXME: This needs to be bigdec
    map? (str "{" (reduce-kv (fn [b k v] (str b (if (> (count b) 0) ", ") (format-json k) ":" (format-json v))) "" x) "}")
    coll? (str "[" (string/join "," (map format-json x)) "]")
    nil? "null"
    x))

(defn timestamp []
  (.format (java.text.SimpleDateFormat. "hh:mm:ss") (java.util.Date.)))

(defn send-result [channel id fields results]
  (println "send result")
  (let [client (get @clients channel)
        {inserts 'insert removes 'remove} (group-by #(get %1 0) results)
        message {"type" "result"
                 "id" id
                 "fields" fields
                 "insert" (map #(drop 2 %1) inserts)
                 "remove" (map #(drop 2 %1) removes)}]
    (println "result" message)
    
    (httpserver/send! channel (format-json message))
    (when DEBUG
      (println "<- result" id "to" (:id client) "@" (timestamp))
      (pprint message))))

(defn send-error [channel id error]
  (let [client (get @clients channel)
        data (ex-data error)
        data (if (:expr data)
               (assoc data :expr (with-out-str (smil/print-smil (:expr data))))
               data)
        message {"type" "error"
                 "id" id
                 "cause" (.getMessage error)
                 "stack" (with-out-str (print-stack-trace error))
                 "data" data}]
    (httpserver/send! channel (format-json message))
    (when DEBUG
      (println "<- error" id "to" (:id client) "@" (timestamp))
      (pprint message))))

(defn send-query-info [channel id raw smil weasl]
  (let [client (get @clients channel)
        message {"type" "query-info"
                 "id" id
                 "raw" (with-out-str (pprint raw))
                 "smil" (with-out-str (smil/print-smil smil))
                 "weasl" (with-out-str (pprint weasl))}]
    (httpserver/send! channel (format-json message))
    (when DEBUG
      (println "<- query-info" id "to" (:id client) "@" (timestamp))
      (pprint message))))


(defn query-callback [id channel]
  (fn [_ form op & [results]]
    (let [fields (smil/get-fields form)]
      (condp = op
        'flush (send-result channel id fields results)
        'close (httpserver/send! channel (format-json {"type" "close" "id" id}))
        'error (send-error channel id results)
        ))))

(defn start-query [db query id channel]
  (let [handler (query-callback id channel)
        exe (repl/exec* db query (repl/buffered-result-handler id handler) #{:expanded :compiled})
        m (meta exe)]
    (swap! clients assoc-in [channel :queries id] exe)
    ;; @FIXME: Since this is on the meta now, this can be requested instead of always pushing it
    (send-query-info channel id (:raw m) (:smil m) (:weasl m))
    (if (:define-only m)
        (do                 
          (send-result channel id [] [])
          (fn [x] (httpserver/send! channel (format-json {"type" "close" "id" id}))))
        exe)))

(defn handle-connection [db channel]
  ;; this seems a little bad..the stack on errors after this seems
  ;; to grow by one frame of org.httpkit.server.LinkingRunnable.run(RingHandler.java:122)
  ;; for every reception. i'm using this interface wrong or its pretty seriously
  ;; damaged
  (swap! clients assoc channel {:id (gensym "client") :queries {}})
  (println "-> connect from" (:id (get @clients channel)) "@" (timestamp))
  (httpserver/on-receive
   channel
   (fn [data]
     ;; create relation and create specialization?
     (let [client (get @clients channel)
           input (json/read-str data)
           id (input "id")
           t (input "type")]
       (println "->" t id "from" (:id client) "@" (timestamp))
       (try
         (condp = t
           "query"
           (let [query (input "query")
                 sexpr (when query (smil/read query))]
             (println "--- Raw ---")
             (println query)
             (start-query db sexpr id channel))
           "close"
           (let [exe (get-in @clients [channel :queries id])]
             (if-not exe
               (send-error channel id (ex-info (str "Invalid query id " id) {:id id}))
               (do (exe 'close)
                   (swap! clients update-in [channel :queries] dissoc id))))
           (throw (ex-info (str "Invalid protocol message type " t) {:message input})))
         (catch Exception error
           (print error)
           (send-error channel id error))
         ))))

  (httpserver/on-close
   channel
   (fn [status]
     (println "-> close from" (:id (get @clients channel)) "@" (timestamp))
     ;; @TODO: cleanup any running computations?
     (swap! clients dissoc channel))))

(defn serve-static [request channel]
  (let [base-path (str (.getCanonicalPath (java.io.File. ".")) "/../")
        response ((-> (fn [req] ; Horrible, horrible rewrite hack
                        (let [first-segment (second (string/split (request :uri) #"/"))]
                          (condp = first-segment
                            "repl" {:status 200 :headers {"Content-Type" "text/html"} :body (slurp (str base-path "/repl.html"))}
                            "grid" {:status 200 :headers {"Content-Type" "text/html"} :body (slurp (str base-path "/index.html"))}
                            "renderer" {:status 200 :headers {"Content-Type" "text/html"} :body (slurp (str base-path "/renderer.html"))}
                           {:status 404})))
                      (wrap-file base-path)
                      (wrap-content-type))
                  request)
        response (if (and (:body response) (= (type (:body response)) java.io.File))
                   (assoc response :body (slurp (:body response)))
                   response)]
    (httpserver/send! channel response)))

(defn async-handler [db content]
  (fn [request]
        (httpserver/with-channel request channel    ; get the channel
          (if (httpserver/websocket? channel)
            (handle-connection db channel)
            (serve-static request channel)))))

(defn serve [db port]
  (println (str "Serving on localhost:" port "/repl"))
  (when-not (nil? @server)
    (@server :timeout 0))
  (try
    (reset! server
            (httpserver/run-server (async-handler db "<http><body>foo</body><http>") {:port port}))
    (catch Exception e (println (str "caught exception: " e (.getMessage e))))))
