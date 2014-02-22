(ns aurora.editor.nodes)

;;*********************************************************
;; Aurora state (nodes)
;;*********************************************************

(defn constant
  ([data] (constant data {}))
  ([data opts] (merge {:type :constant
                       :data data}
                      opts)))

(defn call
  ([ref args] (call ref args {}))
  ([ref args opts] (merge {:type :call
                           :ref ref
                           :args args}
                      opts)))

(defn math []
  {:type :math
   :expression [{:type :ref/js
                 :js "+"}
                3 4]})

(defn match-branch [pattern action]
  {:type :match/branch
   :pattern (or pattern "foo")
   :guards []
   :action (or action {:type :constant
                       :data "wheeee"})})

(defn match [arg pattern action]
  {:type :match
   :arg (or arg "foo")
   :branches [(match-branch pattern action)]})

(defn ref-id [id]
  {:type :ref/id
   :id id})

(defn ref-js [js]
  {:type :ref/js
   :js js})
