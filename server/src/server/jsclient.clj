(ns server.jsclient
  (:require
   [org.httpkit.server :as httpserver]
   [clojure.data.json :as json]
   [server.db :as db]
   [server.edb :as edb]
   [server.repl :as repl]
   [server.exec :as exec]
   [server.compiler :as compiler]
   [clojure.string :as string])) 

(def bag (atom 10))
;; ok, this is a fucked up rewrite right now. take a parameteric
;; term, use it as the return, and strip it off

(defn format-vec [x]
  (str "[" (string/join "," (map (fn [x] (str "\"" x "\"")) x)) "]"))


  
(defn start-query [d query id connection]
  (println "starto" query)
  
  (let [keys (second query)
        prog (compiler/compile-dsl d @bag (concat (rest (rest query)) (list (list 'return (apply list keys)))))]
    ((exec/open d prog (fn [op tuple]
                         (let [msg (format "{\"type\" : \"result\", \"fields\" : %s, \"values\": %s , \"id\": \"%s\"}"
                                           (format-vec keys)
                                           (str "[" (format-vec tuple) "]")
                                           id)]
                           (println "return" msg))))
     'flush [])))


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
           qs (if query (read-string query) nil)
           t (input "type")]
       (println "q" t "q" (first qs) (type t) (type (first qs)))
       (cond
         (and (= t "query")  (= (first qs) 'query)) (start-query d qs (input "id") channel)
         (and (= t "query")  (= (first qs) 'define)) (repl/define d query)
         ;; should some kind of error
         :else
         (println "jason, wth", input))))))


(defn async-handler [db content]
  (fn [ring-request]
    (httpserver/with-channel ring-request channel    ; get the channel
      (if (httpserver/websocket? channel) 
        (handle-connection db channel)
        (if (= (ring-request :uri) "/favicon.ico") (httpserver/send! channel {:status 404})
            (let [terms (string/split (ring-request :uri) #"/")
                  head ["<!DOCTYPE html>"
                        "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">"
                        "<html style=\"width:100%;height:100%;\">"
                        "<body onload =\"start()\" style=\"width:100%;height:100%;\">"
                        "<script>"
                        ""]
                  program (str (terms 1) ".e")
                  programname (str "var program = \"" program "\"\n")
                  userid (str "var userid = \"" (gensym) "\"\n")
                  tail ["</script>"
                        "</body>"
                        "</html>"]]

              (httpserver/send! channel {:status 200
                              :headers {"Content-Type" "text/html"
                                        "Expires" "0"
                                        "Cache-Control" "no-cache, private, pre-check=0, post-check=0, max-age=0"
                                        "Pragma" "no-cache"
                                        }
                              :body    (apply str
                                              (string/join "\n" head)
                                              programname
                                              userid
                                              content
                                              (string/join "\n" tail))})))))))


(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

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
  (try (httpserver/run-server (async-handler db "<http><body>foo</body><http>") {:port 8080})
         (catch Exception e (println (str "caught exception: " e (.getMessage e))))))
