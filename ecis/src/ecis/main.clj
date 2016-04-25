(ns ecis.main
  (:require
   [clojure.java.io]
   [org.httpkit.server :as httpserver]
   [clj-json.core :as json]))


(import java.io.Reader)

(defn input-handler [request]
      (println request)
      (println (json/parsed-seq (clojure.java.io/reader (:body request) :encoding "UTF-8"))))


;; webhook input
(defn serve [port]
  (println (str "Serving on localhost:" port "/repl"))
  (try
    (httpserver/run-server input-handler {:port port})
    (catch Exception e (println (str "caught exception: " e (.getMessage e))))))

(defn -main [& args] 
  (serve 8080))


