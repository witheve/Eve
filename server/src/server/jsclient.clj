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

(def clients (atom {}))
(def server (atom nil))

(def DEBUG true)
(def bag (atom 10))

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
  (let [client (get @clients channel)
        {inserts 'insert removes 'remove} (group-by #(get %1 0) results)
        message {"type" "result"
                 "id" id
                 "fields" fields
                 "insert" (map #(drop 2 %1) inserts)
                 "remove" (map #(drop 2 %1) removes)}]
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
                 "raw" raw
                 "smil" smil
                 "weasl" weasl}]
    (httpserver/send! channel (format-json message))
    (when DEBUG
      (println "<- query-info" id "to" (:id client) "@" (timestamp))
      (pprint message))))

(defn start-query [db query id channel]
  (let [results (atom ())
        [form fields]  (repl/form-from-smil query)
        fields (or fields [])
        store-width (+ (count fields) 2)
        prog (compiler/compile-dsl db form)
        handler (fn [tuple]
                  (condp = (exec/rget tuple exec/op-register)
                    'insert (swap! results conj (vec (take store-width tuple)))
                    'remove (swap! results conj (vec (take store-width tuple)))
                    'flush (do (send-result channel id fields @results)
                               (reset! results '()))
                    'close (println "@FIXME: Send close message")
                    'error (send-error channel id (ex-info "Failure to WEASL" {:data (str tuple)}))))
        e (exec/open db prog handler (fn [n m x] x))]
    (doseq [line (string/split (with-out-str (pprint prog)) #"\n")]
      (println "   " line))

    (swap! clients assoc-in [channel :queries id] e)
    (e 'insert)
    (e 'flush)
    prog))

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
                 expanded (when query (smil/unpack db (smil/read query)))
                 raw (string/join "\n    " (string/split query #"\n"))
                 smil (with-out-str (smil/print-smil expanded :indent 2))]
             (println "  Raw:")
             (println "   " raw)
             (println "  SMIL:")
             (println smil)
             (println "  WEASL:")
             (let [prog (condp = (first expanded)
                          'query (start-query db expanded id channel)
                          'define! (do
                                     (repl/define db expanded)
                                     (send-result channel id [] []))
                          (throw (ex-info (str "Invalid query wrapper " (first expanded)) {:expr expanded})))]
               (send-query-info channel id raw smil (with-out-str (pprint prog)))))
           "close"
           (let [e (get-in @clients [channel :queries id])]
             (if-not e
               (send-error channel id (ex-info (str "Invalid query id " id) {:id id}))
               (do
                 (e 'close)
                 (swap! clients update-in [channel :queries] dissoc id))))
           (throw (ex-info (str "Invalid protocol message type " t) {:message input})))
         (catch clojure.lang.ExceptionInfo error
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


(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(defn serve [db port]
  (println (str "Serving on localhost:" port "/repl"))
  (when-not (nil? @server)
    (@server :timeout 0))
  (try
    (reset! server
            (httpserver/run-server (async-handler db "<http><body>foo</body><http>") {:port port}))
    (catch Exception e (println (str "caught exception: " e (.getMessage e))))))
