(defproject eve "zero"
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [http-kit "2.1.18"]
                 [tentacles "0.5.1"]
                 [clj-jgit "0.8.9"]
                 [ring/ring-core "1.4.0"]
                 [clj-time "0.11.0"]
                 [org.clojure/data.codec "0.1.0"]
                 [org.clojure/data.json "0.2.6"]]
  :plugins [[speclj "3.3.2"]]
  :target-path "target/%s"
  :test-paths ["spec"]
  :main ecis.main
  :profiles {:dev {:dependencies [[speclj "3.3.2"]]}})
