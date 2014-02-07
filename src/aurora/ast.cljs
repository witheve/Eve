(ns aurora.ast
  (:require aurora.util)
  (:require-macros [aurora.macros :refer [check deftraced]]))

(deftraced id! [index x] [x]
  (check (string? x)))

(deftraced js! [index x] [x]
  (check (string? x)))

(deftraced ref-id! [index x] [x]
  (check (= :ref/id (:type x))
         (id! index (:id x))))

(deftraced ref-js! [index x] [x]
  (check (= :ref/js (:type x))
         (js! index (:js x))))

(deftraced ref! [index x] [x]
  (case (:type x)
    :ref/id (ref-id! index x)
    :ref/js (ref-js! index x)
    (check false)))

(deftraced tag! [index x] [x]
  (check (= :tag (:type x))
         (id! index (:id x))
         (string? (:name x))))

(deftraced data! [index x] [x]
  (cond
   (= :tag (:type x)) (tag! index x)
   (#{:ref/id :ref/js} (:type x)) (ref! index x)
   (or (true? x) (false? x)) true
   (number? x) true
   (string? x) true
   (vector? x) (every? #(data! index %) x)
   (map? x) (and (every? #(data! index %) (keys x))
                 (every? #(data! index %) (vals x)))
   :else (check false)))

(deftraced constant! [index x] [x]
  (check (= :constant (:type x))
         (data! index (:data x))))

(deftraced js-data! [index x] [x]
  (cond
   (nil? x) true
   :else (data! index x)))

(deftraced call! [index x] [x]
  (check (= :call (:type x))
         (ref! index (:ref x))
         (sequential? (:args x))
         (case (:type (:ref x))
           :ref/id (every? #(data! index %) (:args x))
           :ref/js (every? #(js-data! index %) (:args x))))) ;; we allow nil when calling cljs stuff

(deftraced match-any! [index x] [x]
  (check (= :match/any (:type x))))

(deftraced match-bind! [index x] [x]
  (check (= :match/bind (:type x))
         (id! index (:id x))
         (pattern! index (:pattern x))))

(deftraced pattern! [index x] [x]
  (cond
   (= :match/any (:type x)) (match-any! index x)
   (= :match/bind (:type x)) (match-bind! index x)
   (= :tag (:type x)) (tag! index x)
   (= :ref/id (:type x)) (ref! index x)
   (= :call (:type x)) (call! index x)
   (or (true? x) (false? x)) true
   (number? x) true
   (string? x) true
   (vector? x) (every? #(pattern! index %) x)
   (map? x) (and (every? #(data! index %) (keys x))
                 (every? #(pattern! index %) (vals x)))
   :else (check false)))

(deftraced branch-action! [index x] [x]
  (case (:type x)
    :call (call! index x)
    :constant (constant! index x)
    (check false)))

(deftraced branch! [index x] [x]
  (check (= :match/branch (:type x))
         (pattern! index (:pattern x))
         (sequential? (:guards x))
         (every? #(call! index %) (:guards x))
         (branch-action! index (:action x))))

(deftraced match! [index x] [x]
  (check (= :match (:type x))
         (data! index (:arg x))
         (sequential? (:branches x))
         (every? #(branch! index %) (:branches x))))

(deftraced math-expression! [index x] [x]
    (check (cond
            (vector? x) (every? #(math-expression! index %) x)
            (number? x) true
            :else (ref! index x))))

(deftraced math! [index x] [x]
    (check (= :math (:type x))
           (:expression x)
           (math-expression! index (:expression x))))

(deftraced step! [index x] [x]
  (check (id! index (:id x)))
  (case (:type x)
    :call (call! index x)
    :constant (constant! index x)
    :match (match! index x)
    :math (math! index x)
    (check false)))

(deftraced page-arg! [index x] [x]
  (check))

(deftraced page! [index x] [x]
  (check (= :page (:type x))
         (id! index (:id x))
         (sequential? (:args x))
         (every? #(page-arg! index (get index %)) (:args x))
         (sequential? (:steps x))
         (every? #(step! index (get index %)) (:steps x))))

(deftraced notebook! [index x] [x]
  (check (= :notebook (:type x))
         (id! index (:id x))
         (sequential? (:pages x))
         (every? #(page! index (get index %)) (:pages x))))

;; examples

(def example-a
  {"example_a" {:type :notebook
                :id "example_a"
                :pages ["root"]}
   "root" {:type :page
           :id "root"
           :args ["a" "b" "c"]
           :steps ["b_squared" "four" "four_a_c" "result"]}
   "b_squared" {:type :call
                :id "b_squared"
                :ref {:type :ref/js
                      :js "cljs.core._STAR_"}
                :args [{:type :ref/id :id "b"} {:type :ref/id :id "b"}]}
   "four" {:type :constant
           :id "four"
           :data 4}
   "four_a_c" {:type :call
               :id "four_a_c"
               :ref {:type :ref/js
                     :js "cljs.core._STAR_"}
               :args [{:type :ref/id :id "four"} {:type :ref/id :id "a"} {:type :ref/id :id "c"}]}
   "result" {:type :call
             :id "result"
             :ref {:type :ref/js
                   :js "cljs.core._"}
             :args [{:type :ref/id :id "b_squared"} {:type :ref/id :id "four_a_c"}]}})

(notebook! example-a (get example-a "example_a"))

(comment
  (match x
         {"a" ^a number? "b" ^b number?} (- a b)
         {"vec" [^z _ "foo"]} (replace z "more foo!")))

(def example-b
  {"example_b" {:type :notebook
                :id "example_b"
                :pages ["root" "vec"]}
   "root" {:type :page
           :id "root"
           :args ["x"]
           :steps ["result"]}
   "result" {:id "result"
             :type :match
             :arg {:type :ref/id :id "x"}
             :branches [{:type :match/branch
                         :pattern {"a" {:type :match/bind :id "a" :pattern {:type :match/any}}
                                   "b" {:type :match/bind :id "b" :pattern {:type :match/any}}}
                         :guards [{:type :call
                                   :ref {:type :ref/js :js "cljs.core.number_QMARK_.call"}
                                   :args [nil {:type :ref/id :id "b"}]}
                                  {:type :call
                                   :ref {:type :ref/js :js "cljs.core.number_QMARK_.call"}
                                   :args [nil {:type :ref/id :id "b"}]}]
                         :action {:type :call
                                  :ref {:type :ref/js :js "cljs.core._"}
                                  :args [{:type :ref/id :id "a"} {:type :ref/id :id "b"}]}}
                        {:type :match/branch
                         :pattern {"vec" {:type :match/bind :id "y" :pattern {:type :match/any}}}
                         :guards []
                         :action {:type :call
                                  :ref {:type :ref/id :id "vec"}
                                  :args [{:type :ref/id :id "y"}]}}]}
   "vec" {:type :page
          :id "vec"
          :args ["y"]
          :steps ["vec_result"]}
   "vec_result" {:id "vec_result"
                 :type :match
                 :arg {:type :ref/id :id "y"}
                 :branches [{:type :match/branch
                             :pattern [{:type :match/bind :id "z" :pattern {:type :match/any}} "foo"]
                             :guards []
                             :action {:type :call
                                      :ref {:type :ref/id :id "replace"}
                                      :args [{:type :ref/id :id "z"}
                                             "more foo!"]}}]}})

(notebook! example-b (get example-b "example_b"))

(comment
  (match x
         {"counter" ^counter _} (replace counter (+ counter 1))))

(def example-c
  {"example_c" {:type :notebook
                :id "example_c"
                :pages ["root"]}
   "root" {:type :page
           :id "root"
           :args ["x"]
           :steps ["counter" "inced" "new_counter"]}
   "counter" {:type :match
              :id "counter"
              :arg {:type :ref/id :id "x"}
              :branches [{:type :match/branch
                          :pattern {"counter" {:type :match/bind :id "y" :pattern {:type :match/any}}}
                          :guards []
                          :action {:type :constant
                                   :data {:type :ref/id :id "y"}}}]}
   "inced" {:type :call
          :id "inced"
          :ref {:type :ref/js :js "cljs.core._PLUS_"}
          :args [{:type :ref/id :id "counter"} 1]}
   "new_counter" {:type :call
                  :id "new_counter"
                  :ref {:type :ref/id :id "replace"}
                  :args [{:type :ref/id :id "counter"} {:type :ref/id :id "inced"}]}})

(notebook! example-c (get example-c "example_c"))

(def example-math
  {"example_math" {:type :notebook
                :id "example_math"
                :pages ["root"]}
   "root" {:type :page
           :id "root"
           :args ["x"]
           :steps ["expression"]}
   "expression" {:type :math
                 :id "expression"
                 :expression [{:type :ref/js
                               :js "+"} 4
                              [{:type :ref/js
                                :js "-"} 3 4 6]
                              5]}})

(notebook! example-math (get example-math "example_math"))
