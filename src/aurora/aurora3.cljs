(ns aurora.aurora2
  (:require [cljs.reader :as reader]
            [clojure.walk :as walk]
            [aurora.util.xhr :refer [xhr]]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(def core-ns "aurora.aurora2")

(def example {:tags ["program"]
              :name "program1"
              :desc "example"
              :manuals {"root" {:tags ["manual"]
                                :name "root"
                                :desc "do something awesome"
                                :steps [{:tags ["step"]
                                         :type :operation
                                         :op {:type :ref
                                              :ns "program1"
                                              :to "addone"}
                                         :args [{:type :value
                                                 :data {:tags ["number"]
                                                        :value 1}}]}
                                        {:type :match
                                         :as (gensym "matched")
                                         :root [{:type :ref
                                                 :to :prev}]
                                         :branches [[{"foo" "bar"} "woot"]
                                                    [{"foo" "bar" "baz" 'z} 'z]
                                                    [{"num" {:type :operation
                                                             :op {:type :ref
                                                                  :ns "aurora.math"
                                                                  :to "even"}}} 2]

                                                    [[1 2 'a] 'a]
                                                    [[1
                                                      {:type :operation
                                                       :op {:type :ref
                                                            :ns "aurora.math"
                                                            :to "even"}}
                                                      'a] 'a]
                                                    [[] 0]
                                                    [2 "success"]
                                                    [:otherwise "foo"]]}

                                        {:tags ["step"]
                                         :type :value
                                         :data {:tags ["list"]
                                                :value {:type :operation
                                                        :op {:type :ref
                                                             :to "alist"
                                                             :ns core-ns}
                                                        :args [{:type :value
                                                                :data {:value [{:type :ref
                                                                                :to :prev}]}}]}}}
                                        {:tags ["step"]
                                         :type :value
                                         :data {:tags ["table"]
                                                :value {:type :operation
                                                        :op {:type :ref
                                                             :to "table"
                                                             :ns core-ns}
                                                        :args [{:type :value
                                                                :data {:value ["foo" "bar"]}}
                                                               {:type :value
                                                                :data {:value [3 4]}}]}}}
                                        {:tags ["step"]
                                         :type :value
                                         :data {:tags ["list"]
                                                :value {:type :operation
                                                        :op {:type :ref
                                                             :to "alist"
                                                             :ns core-ns}
                                                        :args [{:type :value
                                                                :data {:value [1 2 3 4]}}]}}}
                                        {:tags ["step"]
                                         :type :operation
                                         :op {:type :ref
                                              :ns core-ns
                                              :to "each"}
                                         :args [{:tags ["ref"]
                                                 :type :ref
                                                 :to :prev}
                                                {:tags ["ref"]
                                                 :type :ref
                                                 :ns "program1"
                                                 :to "addone"}]}
                                        ]}
                        "addone" {:tags ["manual"]
                                  :name "addone"
                                  :desc "add one"
                                  :params ["cur"]
                                  :steps [{:tags ["math"]
                                           :type :transformer
                                           :name "aurora.math"
                                           :data ["+" 1 {:tags ["ref"]
                                                         :type :ref
                                                         :to "cur"}]}]}}})

(def editor {:programs [example]})


;;*********************************************************
;; utils
;;*********************************************************

(defn is-node? [x]
  (and (map? x) (#{:value :match :operation :transformer :ref} (:type x))))

;;*********************************************************
;; augment
;;*********************************************************

(defn squash-prev [steps]
  (reduce (fn [final cur]
            (let [as (-> final last :as)
                  neue-prev (or as (str (gensym "prev")))
                  replaced (walk/postwalk-replace {:prev neue-prev} cur)]
              (if (or (= cur replaced) as)
                (conj final replaced)
                (let [prev-i (dec (count final))
                      prev (final prev-i)]
                  (-> final
                      (assoc prev-i (assoc prev :as neue-prev))
                      (conj replaced))))))
          []
          steps))

(defn with-augmentations [manual program]
  (let [body (reduce (fn [final cur]
                       (conj final cur {:type :operation
                                        :op {:type :ref
                                             :ns core-ns
                                             :to "capture"}
                                        :args [{:type :value
                                                :data {:value (:name program)}}
                                               {:type :value
                                                :data {:value (:name manual)}}
                                               {:type :ref
                                                :to :prev}]})
                       )
                     [{:type :operation
                       :op {:type :ref
                            :ns core-ns
                            :to "scope"}
                       :args [{:type :value
                               :data {:value (:name program)}}
                              {:type :value
                               :data {:value (:name manual)}}
                              {:type :value
                               :data {:value (mapv symbol (:params manual))}}]}]
                     (:steps manual))]
    (assoc manual :steps (squash-prev body))))

;;*********************************************************
;; optimize
;;*********************************************************

(defn with-optimizations [manual program]
  manual
  )

;;*********************************************************
;; transformers
;;*********************************************************

(defmulti transform :name)

(defn math->ops [thing]
  (if (vector? thing)
    {:type :operation
     :op (if (string? (first thing))
           {:type :ref
            :to (first thing)}
           (first thing))
     :args (rest (map math->ops thing))}
    thing))

(defmethod transform "aurora.math" [{:keys [data]}]
  (node->js* (math->ops data)))

;;*********************************************************
;; emit
;;*********************************************************

(defn resolve-ref [ref]
  (if (:ns ref)
    (str (:ns ref) "." (:to ref))
    (:to ref)))


(defmulti node->js* :type)

(defmethod node->js* :default [thing]
  (pr-str thing))

(defmethod node->js* :value [{:keys [data]}]
  (let [data (:value data)]
    (cond
     (is-node? data) (node->js* data)
     (map? data) (str "{" (reduce str (interpose "," (map node->js* data))) "}")
     (vector? data) (str "[" (reduce str (interpose "," (map node->js* data))) "]")
     :else (node->js* data))))

(def infix-ops #{"+" "-" "*" "/"})
(defmethod node->js* :operation [{:keys [op args]}]
  (if (infix-ops (-> op :to))
    (reduce str (interpose (str " " (-> op :to) " ") (for [arg args]
                                                       (node->js* arg))))
    (str (resolve-ref op) "(" (reduce str (interpose "," (for [arg args]
                                                           (node->js* arg)))) ")")))


(defmethod node->js* :transformer [this]
  (transform this))

(defmethod node->js* :ref [{:keys [to] :as ref}]
  (if (= to :prev)
    '__PREV__
    (resolve-ref ref)))

(def no-wrap #{:match})

(defn node->js [node]
  (if (no-wrap (:type node))
    (str (node->js* node) "\n")
    (str
     (if-let [as (:as node)]
       (str "var " as " = "))
     (node->js* node) ";\n")))

(defn with-code-str [manual program]
  (assoc manual :code (str
                       (:name program) "." (:name manual) " = function("
                       (reduce str (interpose ", " (:params manual)))
                       ") {\n"
                       (when (> (count (:steps manual)) 1)
                         (reduce str (map node->js (butlast (:steps manual)))))
                       (str "return " (-> manual :steps last node->js*) ";\n")
                       "};\n")))

;;*********************************************************
;; match
;;*********************************************************

(defn value-condition [a b]
  (if (and (is-node? a)
           (is-node? b))
    (node->js* {:type :operation
                :op {:type :ref
                     :ns core-ns
                     :to "equiv"}
                :args [a b]})
    (str (node->js* a)  " === " (node->js* b))))

(defn coll-condition [con ref]
  (map (fn [[k v]]
         (let [getter {:type :operation
                       :op {:type :ref
                            :ns core-ns
                            :to "gett"}
                       :args [ref
                              {:type :value
                               :data {:value [k]}}]}]
           (cond
            (= (:type v) :operation) (node->js* (update-in v [:args] conj getter))
            (symbol? v) (str "(" v " = " (node->js* getter) ")")
            :else (value-condition getter v))))
       con))

(defn table-condition [con ref]
  (conj (coll-condition con ref)
        (node->js* {:type :operation
                    :op {:type :ref
                         :ns core-ns
                         :to "isTable"}
                    :args [ref]})))

(defn list-condition [con ref]
  (let [is-list? (node->js* {:type :operation
                             :op {:type :ref
                                  :ns core-ns
                                  :to "isList"}
                             :args [ref]})]
    (if (empty? con)
      [is-list?
       (node->js* {:type :operation
                   :op {:type :ref
                        :ns core-ns
                        :to "isEmpty"}
                   :args [ref]})]
      (conj (coll-condition (map vector (range) con) ref)
            is-list?))))

(defn compile-conditions [branch refs]
  (reduce str (interpose " && " (mapcat (fn [[con ref]]
                                          (cond
                                           (is-node? con) [(value-condition con ref)]
                                           (vector? con) (list-condition con ref)
                                           (map? con) (table-condition con ref)
                                           :else [(value-condition ref con)]))
                                        (map vector (butlast branch) refs))))
  )

(defn compile-branches [branches root as]
  (reduce (fn [final branch]
            (if (= (first branch) :otherwise)
              (str final "else {\n    " as " = " (node->js* (last branch)) ";\n} ")
              (str final "else if(" (compile-conditions branch root) ") {\n    " as " = " (node->js* (last branch)) ";\n} ")))
          (str "if(" (compile-conditions (first branches) root) ") {\n    " as " = " (node->js* (-> branches first last)) ";\n} ")
          (rest branches))
  )

(defmethod node->js* :match [{:keys [root branches as]}]
  (str "var " as " = null;\n"
       (compile-branches branches root as)))

;;*********************************************************
;; compile
;;*********************************************************

(defn program->cljs [program]
  (let [program (assoc program :manuals
                  (into {}
                        (for [[name m] (:manuals program)]
                          [name
                           (-> m
                               (with-augmentations program)
                               (with-optimizations program)
                               (with-code-str program)
                               )])))]
    (assoc program :code (reduce #(str % %2 "\n")
                                 (str (:name program) " = {};\n")
                                 (map :code (vals (:manuals program)))))))

(defn print-ret [x]
  (println x)
  x)

(time (-> (program->cljs example)
                    :code
                    (js/eval)
                    ))

(js/program1.root)

