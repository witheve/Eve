(ns aurora.ast
  (:require aurora.util)
  (:require-macros [aurora.macros :refer [check defchecked]]))

(defchecked id! [x]
  (check (string? x)))

(defchecked order! [x]
  (check (number? x)))

(defchecked js! [x]
  (check (string? x)))

(defchecked ref-id! [x]
  (check (= :ref/id (:type x))
         (id! (:id x))))

(defchecked ref-js! [x]
  (check (= :ref/js (:type x))
         (js! (:js x))))

(defchecked ref! [x]
  (case (:type x)
    :ref/id (ref-id! x)
    :ref/js (ref-js! x)
    (check false)))

(defchecked tag! [x]
  (check (= :tag (:type x))
         (id! (:id x))
         (string? (:name x))))

(defchecked data! [x]
  (cond
   (= :tag (:type x)) (tag! x)
   (#{:ref/id :ref/js} (:type x)) (ref! x)
   (number? x) true
   (string? x) true
   (vector? x) (every? data! x)
   (map? x) (and (every? data! (keys x))
                 (every? data! (vals x)))
   :else (check false)))

(defchecked constant! [x]
  (check (= :constant (:type x))
         (data! (:data x))))

(defchecked call! [x]
  (check (= :call (:type x))
         (ref! (:ref x))
         (sequential? (:args x))
         (every? data! (:args x))))

(defchecked match-any! [x]
  (check (= :match/any (:type x))))

(defchecked match-bind! [x]
  (check (= :match/bind (:type x))
         (id! (:id x))
         (pattern! (:pattern x))))

(defchecked pattern! [x]
  (cond
   (= :match/any (:type x)) (match-any! x)
   (= :match/bind (:type x)) (match-bind! x)
   (= :tag (:type x)) (tag! x)
   (#{:ref/id :ref/js} (:type x)) (ref! x)
   (number? x) true
   (string? x) true
   (vector? x) (every? pattern! x)
   (map? x) (and (every? data! (keys x))
                 (every? pattern! (vals x)))
   :else (check false)))

(defchecked branch-action! [x]
  (case (:type x)
    :call (call! x)
    :constant (constant! x)
    (check false)))

(defchecked branch! [x]
  (check (= :match/branch (:type x))
         (pattern! (:pattern x))
         (branch-action! (:action x))))

(defchecked match! [x]
  (check (= :match (:type x))
         (data! (:arg x))
         (sequential? (:branches x))
         (every? branch! (:branches x))))

(defchecked step! [x]
  (check (id! (:id x))
         (order! (:order x)))
  (case (:type x)
    :call (call! x)
    :constant (constant! x)
    :match (match! x)
    (check false)))

(defchecked page! [x]
  (check (= :page (:type x))
         (id! (:id x))
         (sequential? (:args x))
         (every? id! (:args x))
         (map? (:steps x))
         (every? step! (vals (:steps x)))))

(defchecked notebook! [x]
  (check (= :notebook (:type x))
         (id! (:id x))
         (map? (:pages x))
         (every? page! (vals (:pages x)))))

;; examples

(def example-a
  {:type :notebook
   :id "example_a"
   :pages {"root" {:type :page
                   :order 0
                   :id "root"
                   :args ["a" "b" "c"]
                   :steps {"b_squared" {:id "b_squared"
                                        :type :call
                                        :order 0
                                        :ref {:type :ref/js
                                              :js "cljs.core._STAR_"}
                                        :args [{:type :ref/id :id "b"} {:type :ref/id :id "b"}]}
                           "four" {:id "four"
                                   :order 1
                                   :type :constant
                                   :data 4}
                           "four_a_c" {:id "four_a_c"
                                       :order 2
                                       :type :call
                                       :ref {:type :ref/js
                                             :js "cljs.core._STAR_"}
                                       :args [{:type :ref/id :id "four"} {:type :ref/id :id "a"} {:type :ref/id :id "c"}]}
                           "result" {:id "result"
                                     :order 3
                                     :type :call
                                     :ref {:type :ref/js
                                           :js "cljs.core._"}
                                     :args [{:type :ref/id :id "b_squared"} {:type :ref/id :id "four_a_c"}]}}}}})

(notebook! example-a)

(def example-b
  {:type :notebook
   :id "example_b"
   :pages {"root" {:type :page
                   :id "root"
                   :order 1
                   :args ["x"]
                   :steps {"result" {:id "result"
                                     :type :match
                                     :order 0
                                     :arg {:type :ref/id :id "x"}
                                     :branches [{:type :match/branch
                                                 :pattern {"a" {:type :match/bind :id "a" :pattern {:type :ref/js :js "cljs.core.number_QMARK_"}}
                                                           "b" {:type :match/bind :id "b" :pattern {:type :ref/js :js "cljs.core.number_QMARK_"}}}
                                                 :action {:type :call
                                                          :ref {:type :ref/js :js "cljs.core._"}
                                                          :args [{:type :ref/id :id "a"} {:type :ref/id :id "b"}]}}
                                                {:type :match/branch
                                                 :pattern [{:type :match/bind :id "y" :pattern {:type :match/any}} "foo"]
                                                 :action {:type :constant
                                                          :data {:type :ref/id
                                                                 :id "y"}}}]}}}}})

(notebook! example-b)
