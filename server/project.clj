(defproject eve "zero"
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [http-kit "2.1.18"]
                 [clj-time "0.11.0"]
                 [org.clojure/data.codec "0.1.0"]]
  :target-path "target/%s"
  :main server.main)
