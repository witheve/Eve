(defproject eve "zero"
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [org.clojure/clojurescript "1.7.170"]
                 [devcards "0.2.1"]
                 [http-kit "2.1.18"]
                 [ring/ring-core "1.4.0"]
                 [clj-time "0.11.0"]
                 [org.clojure/data.codec "0.1.0"]
                 [org.clojure/data.json "0.2.6"]
                 [org.clojure/tools.reader "1.0.0-alpha3"]]
  :target-path "target/%s"
  :test-paths ["spec"]
  :profiles {:dev {:dependencies [[speclj "3.3.2"]
                                  [com.cemerick/piggieback "0.2.1"]
                                  [figwheel-sidecar "0.5.2"]]}}
  :plugins [[lein-figwheel "0.5.0-1"]
            [speclj "3.3.2"]]
  :clean-targets [:target-path "out"]
  :cljsbuild {:builds [{:id "dev"
                        :source-paths ["src"]
                        :figwheel true
                        :compiler {:main "ui.root"
                                   :asset-path "/bin"
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
                       {:id "renderer-test"
                        :source-paths ["src"]
                        :figwheel { :renderer-test true } ;; <- note this
                        :compiler { :main "ui.renderer-test"
                                   :asset-path "bin/renderer-test"
                                   :output-dir  "../bin/renderer-test"
                                   :output-to "../bin/renderer-test.bundle.js"
                                   :source-map-timestamp true }}
                       ]}
  :main server.main)
