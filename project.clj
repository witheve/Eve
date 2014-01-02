(defproject aurora "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :cljsbuild {:builds [{:source-paths ["src"]
                        :compiler {:optimizations :simple
                                   :externs []
                                   ;:source-map "bootstrap.js.map"
                                   :output-to "resources/bootstrap.js"
                                   :output-dir "target/cljs/"
                                   :pretty-print true}}]}
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/core.match "0.2.0"]
                 [compojure "1.1.5"]
                 [hiccups "0.2.0"]
                 [ring "1.2.0"]
                 [core.async "0.1.0"]

                 [org.clojure/clojurescript "0.0-1978"]
                 [org.clojure/tools.reader "0.7.10"]
                 [ibdknox/dommy "0.1.2"]]
  :source-paths ["src/"
                 "/Users/chris/repos/clojurescript/src/clj"
                 "/Users/chris/repos/clojurescript/src/cljs"
                 ]
  )
