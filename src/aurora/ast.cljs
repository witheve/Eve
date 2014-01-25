(ns aurora.ast
  (:require [clojure.walk :refer [postwalk]]
            aurora.util)
  (:require-macros [aurora.macros :refer [check]]))

;; id = random 128bit string ;; either a notebook, page or step
;; js = string
;; ref = {:type :ref/step :step id} | {:type :ref/page :page id :notebook id} | {:type :ref/js :js js}
;; tag = {:type :tag :id id :name string} ;; like a namespaced keyword
;; call = {:type :call :ref ref :args [ref*]}
;; data = number | string | tag | [data*] | {data* data*} | ref
;; pattern = number | string | tag | [pattern*] | {data* pattern*} | ref ;; if ref is a step, check equality. if page, treat as predicate
;; action = call | data
;; branch = {:type :match/branch :pattern pattern :action action}
;; match = {:type :match :arg ref/step :branches [branch*]}
;; step = {:id id & (call | data | match)}
;; page = {:type :page :id id :steps [step*]}
;; notebook = {:type :notebook :id id :pages [page*]}

(defn id! [x]
  (check (string? x)))

(defn js! [x]
  (check (string? x)))

(defn ref-step! [x]
  (check (= :ref/step (:type x))
         (id! (:step x))))

(defn ref-page! [x]
  (check (= :ref/page (:type x))
         (id! (:page x))
         (id! (:notebook x))))

(defn ref-js! [x]
  (check (= :ref/js (:type x))
         (js! (:js x))))

(defn ref! [x]
  (case (:type x)
    :ref/step (ref-step! x)
    :ref/page (ref-page! x)
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

(defn pattern! [x]
  (check
   (cond
    (number? x) true
    (string? x) true
    (= :tag (:type x)) (tag! x)
    (vector? x) (every? pattern! x)
    (map? x) (and (every? data! (keys x)) (every? pattern! (vals x)))
    (#{:ref/js :ref/step :ref/page} (:type x)) (ref! x)
    :else false)))

(defn action! [x]
  (check
   (case (:type x)
     :call (call! x)
     :data (data! x)
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
           :data (data! x)
           :match (match! x))))

(defn page! [x]
  (check (= :page (:type x))
         (id! (:id x))
         (sequential? (:steps x))
         (every? step! (:steps x))))

(defn notebook [x]
  (check (= :notebook (:type x))
         (id! (:id x))
         (sequential? (:pages x))
         (every? page! (:pages x))))

