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

(defn match-branch []
  {:type :match/branch
   :pattern "foo"
   :guards []
   :action {:type :constant
            :data "wheeee"}})

(defn match []
  {:type :match
   :arg "foo"
   :branches [(match-branch)]})

(defn ref-id [id]
  {:type :ref/id
   :id id})

(defn ref-js [js]
  {:type :ref/js
   :js js})
