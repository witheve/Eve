(defproject eve "zero"
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [org.clojure/clojurescript "1.7.170"]
                 [devcards "0.2.1"]
                 [http-kit "2.1.18"]
                 [clj-time "0.11.0"]
                 [org.clojure/data.codec "0.1.0"]]
  :target-path "target/%s"
  :plugins [[lein-figwheel "0.5.0-1"]]
  :clean-targets [:target-path "out"]
  :cljsbuild {:builds [{:id "dev"
                        :source-paths ["src"]
                        :figwheel true
                        :compiler {:main "ui.root"
                                   :asset-path "bin"
                                   :output-dir "../bin"
                                   :output-to "../bin/root.bundle.js"}}
                       {:id "devcards"
                        :source-paths ["src"]
                        :figwheel { :devcards true } ;; <- note this
                        :compiler { :main "ui.root"
                                   :asset-path "bin/devcards"
                                   :output-dir  "../bin/devcards"
                                   :output-to "../bin/devcards.bundle.js"
                                   :source-map-timestamp true }}
                       ]}
  :main server.main)
