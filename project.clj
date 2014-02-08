(defproject aurora "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :cljsbuild {:builds [{:id "editor"
                        :source-paths ["src"]
                        :compiler {:optimizations :simple
                                   :externs []
                                   :source-map "resources/editor.js.map"
                                   :output-to "resources/editor.js"
                                   :output-dir "resources/cljs/editor/"
                                   :pretty-print true}}
                       {:id "compiler"
                       :source-paths ["src/aurora/compiler/"
                                      "src/aurora/util/"]
                        :compiler {:optimizations :simple
                                   :externs []
                                   :source-map "resources/compiler.js.map"
                                   :output-to "resources/compiler.js"
                                   :output-dir "resources/cljs/compiler/"
                                   :pretty-print true}}
                       {:id "runtime"
                        :source-paths [
                                       "src/aurora/runtime/"
                                       "src/aurora/util/"
                                       ]
                        :compiler {:optimizations :simple
                                   :externs []
                                   :source-map "resources/runtime.js.map"
                                   :output-to "resources/runtime.js"
                                   :output-dir "resources/cljs/runtime/"
                                   :pretty-print true}}
                       ]}
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/clojurescript "0.0-2156"]
                 [org.clojure/tools.reader "0.8.3"]]
  :source-paths ["src/"
                 "/Users/chris/repos/clojurescript/src/clj"
                 "/Users/chris/repos/clojurescript/src/cljs"
                 ]
    :plugins [[lein-cljsbuild "1.0.2"]]
  )
