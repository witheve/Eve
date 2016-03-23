(defproject eve "zero"
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [http-kit "2.1.18"]
                 [ring/ring-core "1.4.0"]
                 [clj-time "0.11.0"]
                 [org.clojure/data.codec "0.1.0"]
                 [org.clojure/data.json "0.2.6"]
                 [org.clojure/tools.reader "1.0.0-alpha3"]]
  :target-path "target/%s"
  :main server.main)
