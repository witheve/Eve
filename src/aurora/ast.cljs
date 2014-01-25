(ns aurora.ast
  (:require [clojure.walk :refer [postwalk]]
            aurora.util)
  (:require-macros [aurora.macros :refer [check]]))

(defn id! [x]
  (check (string? x)))

(defn js! [x]
  (check (string? x)))

(defn ref-id! [x]
  (check (= :ref/id (:type x))
         (id! (:id x))))

(defn ref-js! [x]
  (check (= :ref/js (:type x))
         (js! (:js x))))

(defn ref! [x]
  (case (:type x)
    :ref/id (ref-id! x)
    :ref/js (ref-js! x)
    false))

(defn tag! [x]
  (check (= :tag (:type x))
         (id! (:id x))
         (string? (:name x))))

(defn call! [x]
  (check (= :call (:type x))
         (ref! (:ref x))
         (sequential? (:args x))
         (every? id! (:args x))))

(defn data! [x]
  (check
   (cond
    (= :tag (:type x)) (tag! x)
    (#{:ref/id :ref/page} (:type x)) (ref! x)
    (number? x) true
    (string? x) true
    (vector? x) (every? data! x)
    (map? x) (and (every? data! (keys x)) (every? data! (vals x)))
    :else false)))

(defn constant! [x]
  (check (= :constant (:type x))
         (data! (:data x))))

(defn match-any! [x]
  (check (= :match/any) (:type x)))

(defn match-bind! [x]
  (check (= :match/bind (:type x))
         (id! (:id x))
         (pattern! (:pattern x))))

(defn pattern! [x]
  (check
   (cond
    (= :match/any (:type x) (match-any! x))
    (= :match/bind (:type x) (match-bind! x))
    (= :tag (:type x)) (tag! x)
    (#{:ref/id :ref/page} (:type x)) (ref! x)
    (number? x) true
    (string? x) true
    (vector? x) (every? pattern! x)
    (map? x) (and (every? data! (keys x)) (every? pattern! (vals x)))
    :else false)))

(defn pattern! [x]
  (check (= :type )))

(defn action! [x]
  (check
   (case (:type x)
     :call (call! x)
     :constant (constant! x)
     false)))

(defn branch! [x]
  (check (= :match/branch (:type x))
         (pattern! (:pattern x))
         (action! (:action x))))

(defn match! [x]
  (check (= :match (:type x))
         (id! (:arg x))
         (sequential? (:branches x))
         (every? branch! (:branches x))))

(defn step! [x]
  (check (id! (:id x))
         (case (:type x)
           :call (call! x)
           :constant (constant! x)
           :match (match! x))))

(defn page! [x]
  (check (= :page (:type x))
         (id! (:id x))
         (sequential? (:args x))
         (every? id! (:args x))
         (sequential? (:steps x))
         (every? step! (:steps x))))

(defn notebook! [x]
  (check (= :notebook (:type x))
         (id! (:id x))
         (sequential? (:pages x))
         (every? page! (:pages x))))

;; examples

(def example-a
  {:type :notebook
   :id "example_a"
   :pages [{:type :page
            :id "root"
            :args ["a" "b" "c"]
            :steps [{:id "b_squared"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._STAR_"}
                     :args ["b" "b"]}
                    {:id "four"
                     :type :constant
                     :data 4}
                    {:id "four_a_c"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._STAR_"}
                     :args ["four" "a" "c"]}
                    {:id "result"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._"}
                     :args ["b_squared" "four_a_c"]}]}]})

(notebook! example-a)

(def example-b
  {:type :notebook
   :id "example_b"
   :pages [{:type :page
            :id "root"
            :args ["x"]
            :steps [{:id "result"
                     :type :match
                     :arg "x"
                     :branches [{:type :match/branch
                                 :pattern {"a" {:type :match/bind :id "a" :pattern {:type :ref/js :js "cljs.core.number_QMARK_"}}
                                           "b" {:type :match/bind :id "b" :pattern {:type :ref/js :js "cljs.core.number_QMARK_"}}}
                                 :action {:type :call
                                          :ref {:type :ref/js :js "cljs.core._"}
                                          :args ["a" "b"]}}
                                {:type :match/branch
                                 :pattern [{:type :match/bind :id "y" :pattern {:type :match/any}} "foo"]
                                 :action {:type :constant
                                          :data {:type :ref/id
                                                 :id "y"}}}]}]}]})

(notebook! example-b)
