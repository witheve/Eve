(ns aurora.service.compiler
  (:require [cljs.compiler :as comp]
            [cljs.analyzer :as cljs]
            [cljs.closure :as cljsc]
            [clojure.walk :as walk]
            [clojure.string :as string]))

(def pipeline-ns 'aurora.pipelines)

(defn squash [pipe]
  (reduce (fn [final cur]
            (let [replaced (walk/postwalk-replace {'_PREV_ (last final)} cur)]
              (if (= cur replaced)
                (conj final replaced)
                (assoc final (dec (count final)) replaced))))
          []
          pipe))

(defn pipeline->code [pipe]
  (list 'defn (:name pipe) (or (:scope pipe) []) (concat '(try) (squash (:pipe pipe)) [(list 'catch 'js/Error 'e (list '.error 'js/console (list 'str (str (:name pipe)) " :: " '(.-stack e) "\n\n")))])))

(defn init-ns []
  (binding [cljs/*cljs-ns* pipeline-ns]
  (let [env {:context :expr :file nil :locals {} :ns {}}]
    (comp/with-core-cljs
         (comp/emit-str (cljs/analyze env '(ns aurora.pipelines
                              (:require [aurora.engine :refer [commute each rem conj assoc]]
                                        [aurora.core :as core]
                                        [cljs.core.match]
                                        [cljs.core.async.impl.protocols :as protos]
                                        [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
                              (:require-macros [cljs.core.match.macros :refer [match]]
                                               [dommy.macros :refer [node sel1 sel]]
                                               [cljs.core.async.macros :refer [go]]
                                               [aurora.macros :refer [filter-match]]))))))))

(init-ns)

(defn compile [forms]
  (try
    (binding [cljs/*cljs-ns* pipeline-ns
              *ns* (create-ns pipeline-ns)]
      (let [env {:context :expr :file nil :locals {} :ns (@cljs/namespaces pipeline-ns)}]
        (comp/with-core-cljs
         (reduce #(str % ";" %2) (for [form forms]
                      (comp/emit-str (cljs/analyze env form)))))))
   (catch Exception e
     (println e)
     )))

(defn compile-pipeline [code]
  (println "reading code")
  (let [all (read-string code)]
    (compile (map pipeline->code all))))
