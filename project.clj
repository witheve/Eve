(defproject aurora "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :profiles {:dev {:cljsbuild {:builds [{:id "editor"
                                         :source-paths ["src"]
                                         :compiler {:optimizations :simple
                                                    :externs []
                                                    :source-map "resources/editor.js.map"
                                                    :output-to "resources/editor.js"
                                                    :output-dir "resources/cljs/editor/"
                                                    :pretty-print true
                                                    :libs [""]}}
                                        {:id "language"
                                         :source-paths ["src/aurora/language/"
                                                        "src/aurora/util/"]
                                         :compiler {:optimizations :simple
                                                    :externs []
                                                    :source-map "resources/language.js.map"
                                                    :output-to "resources/language.js"
                                                    :output-dir "resources/cljs/language/"
                                                    :pretty-print true
                                                    :libs [""]}}
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
                                                    :pretty-print true
                                                    :libs [""]}}
                                        {:id "test"
                                         :source-paths [
                                                        "src/aurora/"
                                                        "test/aurora/"
                                                        ]
                                         :compiler {:optimizations :simple
                                                    :externs []
                                                    :source-map "resources/test.js.map"
                                                    :output-to "resources/test.js"
                                                    :output-dir "resources/cljs/test/"
                                                    :pretty-print true
                                                    :libs [""]}}
                                        ]

                               :test-commands {"unit-tests" ["phantomjs" :runner "resources/test.js"]}
                               } }
             :ci {:cljsbuild {:builds [
                                          {:id "test"
                                           :source-paths [
                                                          "src/aurora/"
                                                          "test/aurora/"
                                                          ]
                                           :compiler {:optimizations :simple
                                                      :externs []
                                                      :source-map "resources/test.js.map"
                                                      :output-to "resources/test.js"
                                                      :output-dir "resources/cljs/citests/"
                                                      :pretty-print true
                                                      :libs [""]}}
                                          ]

                                 :test-commands {"unit-tests" ["phantomjs" :runner "resources/test.js"]}
                                 }

                     :jvm-opts ["-Xmx2g"]
                     }}
  :hooks [leiningen.cljsbuild]
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/clojurescript "0.0-2156"]
                 [fetch "0.1.1"]
                 [org.clojure/tools.reader "0.8.3"]
                 [com.cemerick/double-check "0.5.7-SNAPSHOT"]]
  :source-paths ["src/"]
  :plugins [[lein-cljsbuild "1.0.2"]
            [lein-pprint "1.1.1"]
            [com.cemerick/clojurescript.test "0.3.0"]]

  )
