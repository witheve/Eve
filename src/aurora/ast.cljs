(ns aurora.ast
  (:require aurora.util)
  (:require-macros [aurora.macros :refer [check defchecked]]))

(defchecked id! [index] [x]
  (check (string? x)))

(defchecked js! [index] [x]
  (check (string? x)))

(defchecked ref-id! [index] [x]
  (check (= :ref/id (:type x))
         (id! index (:id x))))

(defchecked ref-js! [index] [x]
  (check (= :ref/js (:type x))
         (js! index (:js x))))

(defchecked ref! [index] [x]
  (case (:type x)
    :ref/id (ref-id! index x)
    :ref/js (ref-js! index x)
    (check false)))

(defchecked tag! [index] [x]
  (check (= :tag (:type x))
         (id! index (:id x))
         (string? (:name x))))

(defchecked data! [index] [x]
  (cond
   (= :tag (:type x)) (tag! index x)
   (#{:ref/id :ref/js} (:type x)) (ref! index x)
   (number? x) true
   (string? x) true
   (vector? x) (every? #(data! index %) x)
   (map? x) (and (every? #(data! index %) (keys x))
                 (every? #(data! index %) (vals x)))
   :else (check false)))

(defchecked constant! [index] [x]
  (check (= :constant (:type x))
         (data! index (:data x))))

(defchecked call! [index] [x]
  (check (= :call (:type x))
         (ref! index (:ref x))
         (sequential? (:args x))
         (every? #(data! index %) (:args x))))

(defchecked match-any! [index] [x]
  (check (= :match/any (:type x))))

(defchecked match-bind! [index] [x]
  (check (= :match/bind (:type x))
         (id! index (:id x))
         (pattern! index (:pattern x))))

(defchecked pattern! [index] [x]
  (cond
   (= :match/any (:type x)) (match-any! index x)
   (= :match/bind (:type x)) (match-bind! index x)
   (= :tag (:type x)) (tag! index x)
   (#{:ref/id :ref/js} (:type x)) (ref! index x)
   (number? x) true
   (string? x) true
   (vector? x) (every? #(pattern! index %) x)
   (map? x) (and (every? #(data! index %) (keys x))
                 (every? #(pattern! index %) (vals x)))
   :else (check false)))

(defchecked branch-action! [index] [x]
  (case (:type x)
    :call (call! index x)
    :constant (constant! index x)
    (check false)))

(defchecked branch! [index] [x]
  (check (= :match/branch (:type x))
         (pattern! index (:pattern x))
         (branch-action! index (:action x))))

(defchecked match! [index] [x]
  (check (= :match (:type x))
         (data! index (:arg x))
         (sequential? (:branches x))
         (every? #(branch! index %) (:branches x))))

(defchecked step! [index] [x]
  (case (:type x)
    :call (call! index x)
    :constant (constant! index x)
    :match (match! index x)
    (check false)))

(defchecked page-arg! [index] [x]
  (check))

(defchecked page! [index] [x]
  (check (= :page (:type x))
         (sequential? (:args x))
         (every? #(page-arg! index (get index %)) (:args x))
         (sequential? (:steps x))
         (every? #(step! index (get index %)) (:steps x))))

(defchecked notebook! [index] [x]
  (check (= :notebook (:type x))
         (sequential? (:pages x))
         (every? #(page! index (get index %)) (:pages x))))

;; examples

(def example-a
  {"example_a" {:type :notebook
                :pages ["root"]}
   "root" {:type :page
           :args ["a" "b" "c"]
           :steps ["b_squared" "four" "four_a_c" "result"]}
   "b_squared" {:type :call
                :ref {:type :ref/js
                      :js "cljs.core._STAR_"}
                :args [{:type :ref/id :id "b"} {:type :ref/id :id "b"}]}
   "four" {:type :constant
           :data 4}
   "four_a_c" {:type :call
               :ref {:type :ref/js
                     :js "cljs.core._STAR_"}
               :args [{:type :ref/id :id "four"} {:type :ref/id :id "a"} {:type :ref/id :id "c"}]}
   "result" {:type :call
             :ref {:type :ref/js
                   :js "cljs.core._"}
             :args [{:type :ref/id :id "b_squared"} {:type :ref/id :id "four_a_c"}]}})

(notebook! example-a (get example-a "example_a"))

(def example-b
  {"example_b" {:type :notebook
               :pages ["root"]}
   "root" {:type :page
           :args ["x"]
           :steps ["result"]}
   "result" {:id "result"
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
                                         :id "y"}}}]}})

(notebook! example-b (get example-b "example_b"))
