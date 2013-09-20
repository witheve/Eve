(ns aurora.transformers.math
  (:require [cljs.core.match]
            [dommy.core :as dommy]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [cljs.core.match.macros :refer [match]]
                   [dommy.macros :refer [node sel1 sel]]
                   [cljs.core.async.macros :refer [go]]
                   [aurora.macros :refer [filter-match]]))

(def ops {"sum" (partial reduce +)
          "/" /
          "+" +
          "-" -
          "*" *
          "count" count})

(defn eval [form]
  (if-not (vector? form)
    form
    (if-let [op (-> form first ops)]
      (apply op (map eval (rest form)))
      nil)))

(defn !math [struct]
  (eval struct))
