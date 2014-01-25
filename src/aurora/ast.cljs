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
         (every? ref! (:args x))))

(defn data! [x]
  (check
   (cond
    (number? x) true
    (string? x) true
    (= :tag (:type x)) (tag! x)
    (vector? x) (every? data! x)
    (map? x) (and (every? data! (keys x)) (every? data! (vals x)))
    (#{:ref/js :ref/step :ref/page} (:type x)) (ref! x)
    :else false)))

(defn constant! [x]
  (check (= :constant (:type x))
         (data! (:data x))))

(defn match-any! [x]
  (check (= :match/any) (:type x)))

(defn pattern! [x]
  (check
   (cond
    (= :match/any (:type x) (match-any! x))
    (number? x) true
    (string? x) true
    (= :tag (:type x)) (tag! x)
    (vector? x) (every? pattern! x)
    (map? x) (and (every? data! (keys x)) (every? pattern! (vals x)))
    (#{:ref/id :ref/page} (:type x)) (ref! x)
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
         (ref-step! (:arg match))
         (sequential? (:branches x))
         (every! branch! (:branches x))))

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
                     :args [{:type :ref/id
                             :id "b"}
                            {:type :ref/id
                             :id "b"}]}
                    {:id "four"
                     :type :constant
                     :data 4}
                    {:id "four_a_c"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._STAR_"}
                     :args [{:type :ref/id
                             :id "four"}
                            {:type :ref/id
                             :id "a"}
                            {:type :ref/id
                             :id "c"}]}
                    {:id "result"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._"}
                     :args [{:type :ref/id
                             :id "b_squared"}
                            {:type :ref/id
                             :id "four_a_c"}]}]}]})

(notebook! example-a)
