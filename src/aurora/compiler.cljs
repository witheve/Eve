(ns aurora.compiler
  (:require [aurora.jsth :as jsth]
            [aurora.ast :as ast]
            [aurora.util :refer [map!]])
  (:require-macros [aurora.macros :refer [for! check deftraced]]))

;; compiler

(let [next (atom 0)]
  (defn new-id []
    (if js/window.uuid
      (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
      (swap! next inc))))

(deftraced id->value [id] [id]
  (check id)
  (symbol (str "value_" id)))

(deftraced id->temp [id] [id]
  (check id)
  (symbol (str "temp_" id)))

(deftraced ref->jsth [index x] [x]
  (case (:type x)
    :ref/id (id->value (:id x))
    :ref/js (symbol (:js x))
    (check false)))

(deftraced tag->jsth [index x] [x]
  `(cljs.core.keyword ~(:id x) ~(:name x)))

(deftraced data->jsth [index x] [x]
  (cond
   (= :tag (:type x)) (tag->jsth index x)
   (#{:ref/id :ref/js} (:type x)) (ref->jsth index x)
   (or (true? x) (false? x)) x
   (number? x) x
   (string? x) x
   (vector? x) `(cljs.core.PersistentVector.fromArray
                 ~(vec (map! #(data->jsth index %) x)))
   (map? x) `(cljs.core.PersistentHashMap.fromArrays
              ~(vec (map! #(data->jsth index %) (keys x)))
              ~(vec (map! #(data->jsth index %) (vals x))))
   :else (check false)))

(deftraced constant->jsth [index x id] [x id]
  (check (= :constant (:type x)))
  `(let! ~(id->value id) ~(data->jsth index (:data x))))

(deftraced js-data->jsth [index x] [x]
  (cond
   (nil? x) nil
   :else (data->jsth index x)))

(deftraced call->jsth [index x id] [x id]
  (let [arg->jsth (case (:type (:ref x))
                    :ref/id data->jsth
                    :ref/js js-data->jsth
                    (check false))] ;; allowed to use nil when calling cljs
    `(let! ~(id->value id) (~(data->jsth index (:ref x)) ~@(map! #(arg->jsth index %) (:args x))))))

(deftraced test->jsth [pred] [pred]
  `(if (not ~pred) (throw failure)))

(deftraced pattern->jsth [index x input] [x input]
  (cond
   (= :match/any (:type x)) `(do)
   (= :match/bind (:type x)) `(do
                                (let! ~(id->value (:id x)) ~(id->value input))
                                (set! (.. frame.vars ~(id->value (:id x))) ~(id->value (:id x)))
                                ~(pattern->jsth index (:pattern x) input))
   (= :tag (:type x)) (test->jsth `(= ~(tag->jsth index x) ~(id->value input)))
   (= :ref/id (:type x)) (test->jsth `(= ~(ref->jsth index x) ~(id->value input)))
   (or (true? x) (false? x)) (test->jsth `(= ~x ~(id->value input)))
   (number? x) (test->jsth `(= ~x ~(id->value input)))
   (string? x) (test->jsth `(= ~x ~(id->value input)))
   (vector? x) `(do
                  ~(test->jsth `(cljs.core.vector_QMARK_.call nil ~(id->value input)))
                  ~(test->jsth `(= ~(count x) (cljs.core.count.call nil ~(id->value input))))
                  ~@(for! [i (range (count x))]
                          (let [new-input (new-id)]
                            `(do
                               (let! ~(id->value new-input) (cljs.core.nth.call nil ~(id->value input) ~i))
                               ~(pattern->jsth index (nth x i) new-input)))))
   (map? x) `(do
               ~(test->jsth `(cljs.core.map_QMARK_.call nil ~(id->value input)))
               ~@(for! [k (keys x)]
                       (let [k-id (new-id)
                             new-input (new-id)]
                         `(do
                            (let! ~(id->temp k-id) ~(data->jsth index k))
                            ~(test->jsth `(cljs.core.contains_QMARK_.call nil ~(id->value input) ~(id->temp k-id)))
                            (let! ~(id->value new-input) (cljs.core.get.call nil ~(id->value input) ~(id->temp k-id)))
                            ~(pattern->jsth index (get x k) new-input)))))
   :else (check false)))

(deftraced action->jsth [index x id] [x id]
  (case (:type x)
    :call (call->jsth index x id)
    :constant (constant->jsth index x id)
    (check false)))

(deftraced guard->jsth [index x] [x]
  (check (= :call (:type x)))
  (let [temp (new-id)]
    `(do
       ~(call->jsth index x temp)
       ~(test->jsth (id->value temp)))))

(deftraced match->jsth [index x id] [x id]
  (check (= :match (:type x)))
  (let [input (new-id)]
    `(do
       ~(constant->jsth index {:type :constant :data (:arg x)} input)
       ~(reduce
         (fn [tail branch]
           (let [exception (new-id)]
             `(try
                (do
                  ~(pattern->jsth index (:pattern branch) input)
                  ~@(for! [guard (:guards branch)]
                          (guard->jsth index guard))
                  ~(action->jsth index (:action branch) id))
                (catch ~(id->temp exception)
                  (if (== ~(id->temp exception) failure)
                    ~tail
                    (throw ~(id->temp exception)))))))
         `(throw failure)
         (reverse (:branches x))))))

(deftraced step->jsth [index x id] [x id]
  (case (:type x)
    :call (call->jsth index x id)
    :constant (constant->jsth index x id)
    :match (match->jsth index x id)
    (check false)))

(deftraced page->jsth [index x id] [x id]
  (check (= :page (:type x)))
  `(fn ~(id->value id) [~@(map! id->value (:args x))]
     (do
       (let! stack notebook.stack)
       (let! frame {})
       (set! frame.id ~id)
       (set! frame.calls [])
       (set! frame.vars {})
       (stack.push frame)
       (set! notebook.stack frame.calls)
       ~@(for! [arg (:args x)]
               `(set! (.. frame.vars ~(id->value arg)) ~(id->value arg)))
       ~@(for! [step-id (:steps x)]
               `(do
                  ~(step->jsth index (get index step-id) step-id)
                  (set! (.. frame.vars ~(id->value step-id)) ~(id->value step-id))))
       (set! notebook.stack stack))
     ~(if (-> x :steps seq)
        (-> x :steps last id->value)
        nil) ;; uh, what does an empty page return?
     ))

(deftraced notebook->jsth [index x] [x]
  (check (= :notebook (:type x)))
  `(fn nil []
     (do
       (let! notebook {})
       (let! failure "MatchFailure!")
       ~@(for! [page-id (:pages x)]
               `(do
                  ~(page->jsth index (get index page-id) page-id)
                  (set! (.. notebook ~(id->value page-id)) ~(id->value page-id)))))
     notebook))

;; runtime

(defn see [state watchers]
  (dissoc
   (reduce
    (fn [state watcher] (watcher state))
    state
    watchers)
   "output"))

(defn tick [index id state watchers]
  (let [index (merge index ast/core)
        jsth (notebook->jsth index (get index id))
        source (jsth/expression->string jsth)
        _ (println "###################")
        _ (println jsth)
        _ (println source)
        notebook (js/eval (str "(" source "());"))
        stack #js []]
    (aset notebook "next_state" state)
    (aset notebook "stack" stack)
    (try
      (.value_root notebook state [])
      (let [next-state (.-next_state notebook)]
        [(see next-state) next-state (aget stack 0)])
      (catch :default e
        (let [next-state (.-next_state notebook)]
          [e next-state (aget stack 0)])))))

;; watchers

(defn watch-timeout* [buffer state]
  (doseq [{:strs [cursor timeout]} (get-in state ["output" "timeout"])]
    (js/setTimeout (fn [] (swap! buffer conj cursor)) timeout))
  (let [cursors @buffer] ;; this is only valid because js is single-threaded
    (reset! buffer nil)
    (reduce #(assoc-in %1 %2 "timeout") state cursors)))

(defn watch-timeout []
  (let [buffer (atom [])]
    #(watch-timeout* buffer %)))

;; examples

(tick ast/example-b "example_b" {"a" 1 "b" 2})
(tick ast/example-b "example_b" {"a" 1 "c" 2})
(tick ast/example-b "example_b" {"a" 1 "b" "foo"})
(tick ast/example-b "example_b" {"vec" [1 "foo"]})
(tick ast/example-b "example_b" {"vec" [1 2]})

(tick ast/example-c "example_c" {"counter" 0})

(->> {"counter" 0} (tick ast/example-c "example_c") first (tick ast/example-c "example_c") first (tick ast/example-c "example_c") first)

;; (tick ast/example-e {"counter" 0 "started_" "false"})
