(ns aurora.service.compiler
  (:require [cljs.compiler :as comp]
            [cljs.analyzer :as cljs]
            [cljs.closure :as cljsc]
            [clojure.walk :as walk]
            [clojure.string :as string]))

(def pipeline-ns 'aurora.pipelines)

(defn squash [pipe]
  (reduce (fn [final cur]
            (let [replaced (walk/postwalk-replace {'_PREV_ '_PREV_REPLACE_} cur)]
              (if (= cur replaced)
                (conj final cur)
                (assoc final (dec (count final)) (list 'let ['_PREV_REPLACE_ (last final)] replaced)))))
          []
          pipe))

(defn pipeline->code [pipe]
  (list 'def (:name pipe) (list 'fn (:name pipe) (or (:scope pipe) []) (concat '(try) (squash (:pipe pipe)) [(list 'catch 'js/Error 'e (list '.error 'js/console (list 'str (str (:name pipe)) " :: " '(.-stack e) "\n\n")))]))))

(defn init-ns []
  (binding [cljs/*cljs-ns* pipeline-ns]
  (let [env {:context :expr :file nil :locals {} :ns {}}]
    (comp/with-core-cljs
         (comp/emit-str (cljs/analyze env '(ns aurora.pipelines
                              (:require [aurora.engine :refer [commute assoc-in each-meta each rem conj assoc]]
                                        [aurora.core :as core]
                                        [cljs.core.match]
                                        [cljs.core.async.impl.protocols :as protos]
                                        [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
                              (:require-macros [cljs.core.match.macros :refer [match]]
                                               [dommy.macros :refer [node sel1 sel]]
                                               [cljs.core.async.macros :refer [go]]
                                               [aurora.macros :refer [filter-match]]))))
         (comp/emit-str (cljs/analyze env '(ns running.pipelines
                              (:require [aurora.engine :refer [each each-meta assoc-in rem conj assoc]]
                                        [aurora.transformers.editor :refer [commute]]
                                        [aurora.core :as core]
                                        [cljs.core.match]
                                        [cljs.core.async.impl.protocols :as protos]
                                        [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
                              (:require-macros [cljs.core.match.macros :refer [match]]
                                               [dommy.macros :refer [node sel1 sel]]
                                               [cljs.core.async.macros :refer [go]]
                                               [aurora.macros :refer [filter-match]]))))))))

(init-ns)

(defn compile [forms cur-ns]
  (try
    (binding [cljs/*cljs-ns* cur-ns
              *ns* (create-ns cur-ns)]
      (let [env {:context :expr :file nil :locals {} :ns (@cljs/namespaces cur-ns)}]
        (comp/with-core-cljs
         (reduce #(str % ";" %2) (for [form forms]
                      (comp/emit-str (cljs/analyze env form)))))))
   (catch Exception e
     (println e)
     (str e)
     )))

(defn compile-pipeline [code ns-prefix]
  (let [cur-ns (symbol (str (or ns-prefix "aurora") ".pipelines"))
        all (read-string code)]
    (compile (map pipeline->code all) cur-ns)))
