(ns server.compiler
  (:require
   [server.db :as db]
   [server.edb :as edb]
   [server.exec :as exec]
   [clojure.set :as set]
   [clojure.string :as string]
   [clojure.pprint :refer [pprint]]))

(def initial-register 5)

;; cardinality changing operations should set a flag so we know
;; should also be able to retire registers that aren't being referenced
;; anymore...also add the unique flag for downedges that have already
;; been explicitly or implicitly deltad


;; environment should keep an identifier on the delta currently in effect
;; what about non-unique conditions?

(defn partition-2 [pred coll]
  ((juxt
    (partial filter pred)
    (partial filter (complement pred)))
   coll))

(defn merge-state [a b]
  (if (and (map? a) (map? b))
    (merge-with merge-state a b)
    (if (and (coll? a) (coll? b))
      (into a b)
      b)))

(defn build [& a]
  (doall (apply concat a)))


(defn new-env [d]
  (let [env (atom {})]
    (swap! env assoc 'db d)
    env))

;; wrap a handler
(defn compile-error [message data]
  (throw (ex-info message (assoc data :type "compile"))))

;; lookup happens in the emit stage, it returns either a constant value, or the register
;; which is currently holding that value
(defn lookup [env name]
  (if (or (symbol? name) (keyword? name))
    (get-in @env ['bound name] nil)
    name))

(defn is-bound? [env name]
  (if (or (symbol? name) (keyword? name))
    (if (get-in @env ['bound name] nil)
      true
      false)
    name))

(defn add-dependencies [env & names]
  (swap! env
         #(merge-with merge-state %1 {'dependencies (set (filter symbol? names))})))

(defn bind-names [env names]
  (swap! env
         #(merge-with merge-state %1 {'bound names})))

;; this overflow register set probably isn't the best plan, but its
;; likely better than the 'overwrite the registers on startup with
;; a sufficiently large set
(defn allocate-register [env name]
  (let [bound (- exec/basic-register-frame 1)
        r (get @env 'register initial-register)]
    (if (> r (- bound 1))
      (let [r (get @env 'overflow 0)]
        (bind-names env {name [bound r]})
        (swap! env #(assoc %1 'overflow (inc r)))
        [bound r])
      (do
        (swap! env #(assoc %1 'register (inc r)))
        (bind-names env {name [r]})
        r))))

(defn term [env op & terms]
  (list (conj (map (fn [x] (lookup env x)) terms) op)))

(defn generate-send [env channel arguments]
  (apply add-dependencies env arguments)
  (if (> (count arguments) 0)
    (build
     (apply term env 'tuple exec/temp-register (map #(lookup env %1) arguments))
     (list (list 'send channel exec/temp-register)))
    (doall (list (list 'send channel [])))))



(declare compile-conjunction)


(defn compile-simple-primitive [env terms down]
  (let [argmap (apply hash-map (rest terms))
        simple [(argmap :return) (argmap :a) (argmap :b)]
        ins (map #(get-in @env ['bound %1] nil) simple)]
    (if (some not (rest ins))
      ;; handle the [b*] case by blowing out a temp
      (do
        (allocate-register env (first simple))
        (build
         (apply term env (first terms) simple)
         (down)))
      (compile-error (str "unhandled bound signature in" terms) {:env env :terms terms}))))


(defn generate-binary-filter [env terms down]
  (let [argmap (apply hash-map (rest terms))]
    (apply add-dependencies env terms)
    (let [r  (build
             (term env (first terms) exec/temp-register (argmap :a) ( argmap :b))
             (term env 'filter exec/temp-register)
             (down))]
      r)))

(defn compile-equal [env terms down]
  (let [argmap (apply hash-map (rest terms))
        simple [(argmap :a) (argmap :b)]
        a (is-bound? env (argmap :a))
        b (is-bound? env (argmap :b))
        rebind (fn [s d]
                 (bind-names env {d s})
                 (down))]
    (cond (and a b) (generate-binary-filter env terms down)
          a (rebind a (argmap :b))
          b (rebind b (argmap :a))
          :else
          (compile-error "reordering necessary, not implemented" {:env env :terms terms}))))

(defn indirect-bind [slot m]
  (zipmap (vals m) (map (fn [x] [slot x]) (keys m))))

;; figure out how to handle the quintuple
;; need to do index selection here - resolve attribute name
(defn generate-scan [env terms down collapse]
  (let [signature [:entity :attribute :value :bag :tick :user]
        pmap (zipmap signature (range (count signature)))
        amap (apply hash-map (rest terms))
        [bound free] (partition-2 (fn [x] (is-bound? env (amap x))) signature)
        [specoid index-inputs index-outputs] [edb/full-scan-oid () signature]
        filter-terms (set/intersection (set index-outputs) (set bound))
        target-reg-name (gensym 'target)
        target-reg (allocate-register env target-reg-name)
        body (reduce (fn [b t]
                       (fn []
                         (generate-binary-filter
                          env
                          (list '= :a [target-reg (pmap t)] :b (amap t))
                          b)))
                     down filter-terms)]

    (bind-names env (indirect-bind target-reg (zipmap (map pmap free) (map amap free))))

    (if collapse
      (apply build
             ;; needs to take a projection set for the indices
             (term env 'scan specoid exec/temp-register [])
             (term env 'delta-e target-reg-name exec/temp-register)
             (list (body)))
      (apply build
             (term env 'scan specoid exec/temp-register [])
             (list (body))))))


(defn make-continuation [env name body]
  (swap! env #(merge-with merge-state %1 {'blocks {name (list 'bind name body)}})))

(defn make-bind [env inner-env name body]
  (let [over (get @inner-env 'overflow)
        body (if over
               (build body (term @inner-env 'tuple [(- exec/basic-register-frame 1)] (repeat over nil)))
               body)]
    (swap! env update-in ['blocks] concat (get @inner-env 'blocks))
    (make-continuation env name body)))


(defn get-signature [relname callmap bound]
  (let [bound (set bound)
        keys (sort (keys callmap))
        adornment (string/join "," (map #(str (name %1) "=" (if (bound %1) "b" "f")) keys))]
    (str relname "|" adornment)))

;; unification across the keyword-value bindings (?)
(defn compile-implication [env terms down]
  (let [relname (name (first terms))
        to-input-slot (fn [ix] [exec/input-register (inc ix)])
        callmap (apply hash-map (rest terms))
        arms (atom ())
        [bound free] (partition-2 (fn [x] (is-bound? env (x callmap))) (keys callmap))
        signature (get-signature relname callmap bound)
        tail-name (gensym "continuation")
        army (fn [parameters body]
               (let [arm-name (gensym signature)
                     inner-env (new-env (get @env 'db))
                     _ (bind-names inner-env (zipmap (map name bound) (map to-input-slot (range (count bound)))))
                     body (compile-conjunction inner-env body (fn [] (generate-send inner-env tail-name (map name free))))]
                 (make-bind env inner-env arm-name body)
                 arm-name))]

    ;; validate the parameters as both a proper superset of the input
    ;; and conformant across the union legs
    (db/for-each-implication (get @env 'db) relname
                             (fn [parameters body]
                               (swap! arms conj (army parameters body))))

    (bind-names env (zipmap (map callmap free) (map to-input-slot (range (count free)))))
    (make-continuation env tail-name (down))
    (apply build (map #(generate-send env %1 (map callmap bound)) @arms))))

(defn compile-union [env terms down]
  (let [[_ proj & arms] terms
        tail-name (gensym "continuation")
        [bound free] (partition-2 (fn [x] (is-bound? env x)) proj)
        to-input-slot (fn [ix] [exec/input-register (inc ix)])
        body (apply build
                    (map #(let [arm-name (gensym "arm")
                                inner-env (new-env (get @env 'db))
                                _ (bind-names inner-env (zipmap bound (map to-input-slot (range (count bound)))))
                                body (rest (rest %1))
                                _ (println "BODY" body)
                                body (compile-conjunction inner-env body (fn [] (generate-send inner-env tail-name free)))]
                            (make-bind env inner-env arm-name body)
                            (generate-send env arm-name bound)) arms))]
    (bind-names env (zipmap free (map to-input-slot (range (count free)))))
    (make-continuation env tail-name (down))
    body))


(defn compile-insert [env terms down]
  (let [bindings (apply hash-map (rest terms))
        e (if-let [b (bindings :entity)] b nil)
        a (if-let [b (bindings :attribute)] b nil)
        v (if-let [b (bindings :value)] b nil)
        b (if-let [b (bindings :bag)] b [2])] ; default bag

    (let [z (down)]
      (apply build
             (term env 'tuple exec/temp-register e a v b)
             (term env 'scan edb/insert-oid exec/temp-register exec/temp-register)
             (list z)))))



(defn compile-query [env terms down]
  (let [[query proj & body] terms
        inner-env (new-env (get @env 'db))
        inner-name (gensym "query")
        tail-name (gensym "continuation")
        [bound free] (partition-2 (fn [x] (is-bound? env x)) proj)
        to-input-slot (fn [ix] [exec/input-register (inc ix)])
        _ (bind-names inner-env (zipmap bound (map to-input-slot (range (count bound)))))
        body (compile-conjunction inner-env body (fn [] (generate-send inner-env tail-name free)))]
    (make-continuation env tail-name (down))
    (make-bind env inner-env inner-name body)
    (generate-send env inner-name bound)))

(defn compile-expression [env terms down]
  (let [commands {'+ compile-simple-primitive
                  '* compile-simple-primitive
                  '/ compile-simple-primitive
                  '- compile-simple-primitive
                  '< generate-binary-filter
                  '> generate-binary-filter
                  'sort compile-simple-primitive ;; ascending and descending

                  'str compile-simple-primitive
                  'insert-fact-btu! compile-insert
                  'fact-btu (fn [e terms down]
                              (generate-scan e terms down true))
                  'full-fact-btu (fn [e terms down]
                                   (generate-scan e terms down true))
                  'range compile-simple-primitive
                  '= compile-equal
                  'not-equal generate-binary-filter
                  'union compile-union
                  'query compile-query}
        relname (first terms)]
    (if-let [c (commands relname)]
      (c env terms down)
      (compile-implication env terms down))))

(defn compile-conjunction [env terms down]
  (if (empty? terms) (down)
      (compile-expression env (first terms)
                          (fn [] (compile-conjunction env (rest terms) down)))))

(defn compile-dsl [d bag terms]
  (let [env (new-env d)
        ;; side effecting
        _ (swap! env assoc 'bag bag)
        ;; (send 'out [1])
        p (compile-expression
           env terms (fn [] (generate-send env 'out (list exec/input-register))))]
    (make-continuation env 'main p)
    (pprint (vals (get @env 'blocks)))
    (vals (get @env 'blocks))))
    ;; emit blocks
    ;; wrap the main block
