(ns server.jsclient
  (:require
   [org.httpkit.server :as httpserver]
   [server.db :as db]
   [server.edb :as edb]
   [server.repl :as repl]
   [server.exec :as exec]
   [server.compiler :as compiler]
   [clojure.string :as string])) 

(defn sexp-to-json [term]
  (cond
    (= term ()) "[]"
    (or (seq? term) (vector? term))
    (str "["
         (reduce
          (fn [a b] (str a ", " b))
          (map sexp-to-json term))
         "]")
    ;; ok, this is sad, we're going to collapse symbols and strings   
    (or (string? term) (symbol? term))
    (str "\"" term "\"")
    :else (str term)))


(defn browser-webby-loop [db channel]
  (let [ndb (edb/create-edb)
        
        wrap-handler (fn [remote] (fn [op tup] ()))
                          
        compile (fn [program result-oid]
                  (concat (list (list 'open 'return-channel result-oid [])) program))
                        

        execute (fn [program handler]
                  ;; unify this with the repl and allow for incremental recompilation
                  ;; while maintaining the terminal projection
                  (let [result
                        (fn [c p]
                          (fn [op t]
                            (httpserver/send! channel
                                   (sexp-to-json ['send handler op t]))))
                        p (compile program handler)]
                    (swap! ndb assoc handler result)
                    ;; xxx- probably dont want to send the immutatable dereference
                    ;; of db here
                    ((exec/open [] @ndb p 0) 'insert [])))]

    
        
    ;; make sure if we load things they are inserted into the parent scope
    ;; but read from this shadowing scope(?)
    ;; 
    ;; this seems a little bad..the stack on errors after this seems
    ;; to grow by one frame of org.httpkit.server.LinkingRunnable.run(RingHandler.java:122)
    ;; for every reception. i'm using this interface wrong or its pretty seriously
    ;; damaged


    (httpserver/on-receive channel
                (fn [data]
                  ;; create relation and create specialization?
                  (let [input (read-string data)
                        c (first input)]

                    (cond
                      ;; why is this a string?
                          (= c "diesel") (let [program (read-string (nth input 3))
                                               handler (wrap-handler (nth input 2))
                                               p (compiler/compile-dsl db program)]
                                           (execute program handler))

                          (= c "weasel") (let [program (read-string (nth input 3))
                                               handler (nth input 2)]
                                           (execute program handler))

                          ;; turn back on bridging of execution
                          ;;(= c "send") (let [[op tuple] (rest input)]
                          ;;               ((@input-handler-map oid) op tuple))
                          
                          
                          :else
                          (println "websocket wth" c (type c))))))))



(defn async-handler [db content]
  (fn [ring-request]
    (httpserver/with-channel ring-request channel    ; get the channel
      (if (httpserver/websocket? channel) 
        (browser-webby-loop db channel)
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

(defn serve [db]
  ;; its really more convenient to allow this to be reloaded
  (let [content
        (apply str (map (fn [p] (slurp (clojure.java.io/file (.getPath (clojure.java.io/resource p)))))
                        '("translate.js"
                          "db.js"
                          "edb.js"
                          "svg.js"
                          "websocket.js")))]
    (try (httpserver/run-server (async-handler db content) {:port 8080})
         (catch Exception e (println (str "caught exception: " e (.getMessage e)))))))
