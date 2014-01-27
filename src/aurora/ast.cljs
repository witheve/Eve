(ns aurora.ast
  (:require aurora.util)
  (:require-macros [aurora.macros :refer [check defchecked]]))

(defchecked id! [x]
  (check (string? x)))

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
  (check (id! (:id x)))
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
         (sequential? (:steps x))
         (every? step! (:steps x))))

(defchecked notebook! [x]
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
                     :args [{:type :ref/id :id "b"} {:type :ref/id :id "b"}]}
                    {:id "four"
                     :type :constant
                     :data 4}
                    {:id "four_a_c"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._STAR_"}
                     :args [{:type :ref/id :id "four"} {:type :ref/id :id "a"} {:type :ref/id :id "c"}]}
                    {:id "result"
                     :type :call
                     :ref {:type :ref/js
                           :js "cljs.core._"}
                     :args [{:type :ref/id :id "b_squared"} {:type :ref/id :id "four_a_c"}]}]}]})

(notebook! example-a)

(def example-b
  {:type :notebook
   :id "example_b"
   :pages [{:type :page
            :id "root"
            :args ["x"]
            :steps [{:id "result"
                     :type :match
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
                                                 :id "y"}}}]}]}]})

(notebook! example-b)
