(defproject aurora "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :cljsbuild {:builds [{:source-paths ["src"]
                        :compiler {:optimizations :simple
                                   :externs []
                                   :output-to "bootstrap.js"
                                   :output-dir "target/cljs/"
                                   :pretty-print true}}]}
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/core.match "0.2.0-rc5"]
                 [compojure "1.1.5"]
                 [ring "1.2.0"]
                 [core.async "0.1.0"]

                 ;;latest clojurescript :dependencies
                 [org.clojure/data.json "0.2.2"]
                 [org.clojure/tools.reader "0.7.6"]
                 [org.clojure/google-closure-library "0.0-20130212-95c19e7f0f5f"]
                 [com.google.javascript/closure-compiler "v20130603"]

                 [ibdknox/dommy "0.1.2"]]
  :source-paths ["src/"
                 "/Users/chris/repos/clojurescript/src/clj"
                 "/Users/chris/repos/clojurescript/src/cljs"
                 ]
  )
