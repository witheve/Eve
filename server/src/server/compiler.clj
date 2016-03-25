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

(defn new-env [] (atom {}))

;; wrap a handler
(defn compile-error [message data]
  (throw (ex-info message (assoc data :type "compile"))))

;; lookup happens in the emit stage, it returns either a constant value, or the register
;; which is currently holding that value
(defn lookup [env name]
  (if (or (symbol? name) (keyword? name))
    (if-let [register (get-in @env ['bound name])]
      register
      (compile-error (str "Could not resolve name " name " in environment " @env) {:env @env}))
    name))

(defn is-bound? [e name]
  (if (or (symbol? name) (keyword? name))
    (if (get-in @env ['bound name])
      true
      false)
    false))

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

;; a generator is a null-adic function which spits out weasel using
;; the (possibly updated) environment that was captured at the
;; time it was compiled
(defn compose [& gens]
  (fn [] (apply concat (map #(%1) gens))))

;; is lookup always the right thing here?
;; term is a fragment i guess, to shortcut some emits (?)
(defn term [env op & terms]
  (fn []
    (list (conj (map (fn [x] (lookup env x)) terms) op))))

(defn generate-send [env channel arguments]
    (apply add-dependencies env channel arguments) ;; @FIXME: Should channel be in here anymore?
    (let [cycle-filters (map #(term env 'filter %1)
                             (set/difference (get @env 'cycles)
                                             (get @env 'cycle-heads)))]
      (apply compose
             (concat cycle-filters
                     (list (apply term env 'tuple tmp-register (map #(get-in @env ['bound %1]) arguments)))
                     [(fn [] (list 'send channel tmp-register))]))))

(defn generate-projected-query [env inside-block block-name projection
                      target-block-name target-block-params] ;; send construction
  (let [inner-env (new-bindings)
        [bound free] (partition-2 #(is-bound? env %1) projection)
        tuple-target-name (gensym 'closure-tuple)
        input-map (zipmap bound (range (count bound)))
        body (compile-conjunction inner-env inside-block ;; @FIXME: is inside-block actually body? We should try to standardize the parameter ordering and names.
                                  (fn [] (generate-send target-block-name
                                                        target-block-params)))]
    (if-let [over (get @env 'overflow)]
      (compose body (term @env 'tuple [(- exec/basic-register-frame 1)] (repeat over nil))))
    (swap! env #(merge-with merge-state %1 {'blocks (list ('bind block-name tuple-target-name (body)))}))
    (throw (ex-info "IMPLEMENT ME" {})))) ;; @FIXME: What is tuple-names supposed to be here?


(declare compile-conjunction)

(defn compile-return [env terms down]
  (compose
   (generate-send env 'return-channel (if-let [k (second terms)] k ()))
   (down env))) ;; @FIXME: down should wrap it's env, write?

(defn compile-simple-primitive [env terms down]
  (let [argmap (apply hash-map (rest terms))
        simple [(argmap :return) (argmap :a) (argmap :b)]
        ins (map #(get-in @env ['bound %1]) simple)]
    (if (some not (rest ins))
      ;; handle the [b*] case by blowing out a temp
      (do
        (allocate-register env (first simple))
        (compose
         (apply term env (first terms) simple)
         (down env))) ;; @FIXME: down should wrap its env
      (compile-error (str "unhandled bound signature in" terms) {:env env :terms terms}))))


(defn generate-binary-filter [env terms down]
  (let [argmap (apply hash-map (rest terms))]
    (apply add-dependencies env terms)
    (compose
     (term env (first terms) tmp-register (argmap :a) ( argmap :b))
     (term env 'filter tmp-register)
     (down env)))) ;; @FIXME: down should wrap its env

(defn compile-equal [env terms down]
  (let [argmap (apply hash-map (rest terms))
        simple [(argmap :a) (argmap :b)]
        a (is-bound? env (argmap :a))
        b (is-bound? env (argmap :b))
        rebind (fn [s d]
                 (bind-names env {d s})
                 (down env))] ;; @FIXME: down should wrap its env
    (cond (and a b) (generate-binary-filter env terms down)
          a (rebind a (argmap :b))
          b (rebind b (argmap :a))
          :else
          (compile-error "reordering necessary, not implemented" {:env env :terms terms}))))

(defn indirect-bind [slot m]
  (zipmap (vals m) (map (fn [x] [slot x]) (keys m))))

(defn tuple-from-btu-keywords [terms]
  (let [tmap (apply hash-map terms)]
    ;; optional bagginess
    [(tmap :entity) (tmap :attribute) (tmap :value)]))

;; figure out how to handle the quintuple
;; need to do index selection here - resolve attribute name
(defn compile-edb [env terms down]
  (let [triple (tuple-from-btu-keywords (rest terms))
        [bound free] (partition-2 #(is-bound? env (nth triple %1)) (range 3))
        [specoid index-inputs index-outputs] [edb/full-scan-oid () '(0 1 2)]
        ;; xxx - ech - fix this partial specification
        argmap (zipmap (range 3) triple)
        filter-terms (set/intersection (set index-outputs) (set bound))
        extra-map (zipmap filter-terms (map #(gensym 'xtra) filter-terms))
        target-reg-name (gensym 'target)
        target-reg (allocate-register env target-reg-name)
        body (fn [] ;;@FIXME: This should become a Type C that closes over its env
               (bind-names env (indirect-bind target-reg extra-map))
               (bind-names env (indirect-bind target-reg (zipmap free (map argmap free))))
               ((reduce (fn [down t]
                          (fn [call-env] ;; @FIXME: This is recursively building a down chain, so should close its env
                            (generate-binary-filter call-env
                                                    (list '= :a (extra-map t) :b (nth triple t))
                                                    down)))
                        down
                        filter-terms) env))] ;; @FIXME: down needs to close over its env, so this arg goes away

    (compose
     ;; needs to take a projection set for the indices
     (term env 'scan specoid target-reg-name [])
     ;;     (term e 'delta-e dchannel-name channel-name)
     body)))

(defn make-bind [env inner-env name body]
  (let [over (get @inner-env 'overflow)
        body (if over
               (compose body (term @inner-env 'tuple [(- exec/basic-register-frame 1)] (repeat over nil)))
               body)]
    (swap! env #(merge-with merge-state %1 {'blocks (assoc (get @inner-env 'blocks) name (list 'bind name body))}))
    body))

(defn make-continuation [env name body]
  (swap! env #(merge-with merge-state %1 {'blocks {name (list (list 'bind name (body)))}}))
  body)

(defn get-signature [relname callmap bound]
  (println (type bound))
  (let [bound (set bound)
        keys (sort (keys callmap))
        adornment (string/join "," (map #(str (name %1) "=" (if (bound %1) "b" "f")) keys))]
    (str relname "|" adornment)))

;; unification across the keyword-value bindings (?)
(defn compile-implication [env terms down]
  (let [relname (name (first terms))
        callmap (apply hash-map (rest terms))
        arms (atom ())
        [bound free] (partition-2 (fn [x] (is-bound? env (x callmap))) (keys callmap))
        signature (get-signature relname callmap bound)

        tail-name (gensym "continuation")
        _ (make-continuation env tail-name (down))

        army (fn [parameters body]
               (let [arm-name (gensym signature)
                     inner-env (new-bindings)
                     to-input-slot (fn [ix] [exec/input-register (inc ix)])
                     _ (bind-names inner-env (zipmap bound (map to-input-slot (range (count bound)))))
                     body (compile-conjunction inner-env body (generate-send inner-env tail-name free))]
                 (make-bind env inner-env arm-name body)
                 arm-name))]

    ;; validate the parameters as both a proper superset of the input
    ;; and conformant across the union legs
    ;; @FIXME: When we distribute this will get very sad.
    (db/for-each-implication (get @env 'db) relname
                             (fn [parameters body]
                               (swap! arms conj (army parameters body))))
    (apply compose (map #(generate-send env %1 bound) @arms))))


(defn compile-insert [env terms cont]
  (let [bindings (apply hash-map (rest terms))
        e (if-let [b (bindings :entity)] b nil)
        a (if-let [b (bindings :attribute)] b nil)
        v (if-let [b (bindings :value)] b nil)
        b (if-let [b (bindings :bag)] b [2])] ; default bag

    (compose
     (term env 'tuple tmp-register e a v b)
     (term env 'scan edb/insert-oid tmp-register tmp-register)
     (cont env))))



(defn compile-query [env terms cont]
  ;; this has a better formulation in the new world? what about export
  ;; of solution? what about its projection?
  ;; the bindings of the tail need to escape, but not the
  ;; control edge (cardinality)
  (let [body (rest (rest terms)) ;; smil - (if (vector? (second terms)) (rest terms) terms))
        out (compile-conjunction env body (fn [e] (fn [] ())))
        down (cont env)] ;; @FIXME: if continuation is not a down, what is it? if it is, it should close over its env
    (fn []
      ((compose
        down)))))

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
                  'fact-btu compile-edb
                  'range compile-simple-primitive
                  '= compile-equal
                  'not-equal generate-binary-filter
                  'union compile-union
                  'return compile-return
                  'query compile-query}
        relname (first terms)]
    (if-let [c (commands relname)]
      (c env terms down)
      (compile-implication env terms down))))

(defn compile-conjunction [env terms down]
  (if (empty? terms) (down)
      (compile-expression env (first terms)
                          (fn [] (compile-conjunction env (rest terms) down)))))


;; multiple kv, no deep keys
(defn bset2 [e & key]
  (when (not (empty? key))
    (bset e (first key) (second key))
    (apply bset2 e (rest (rest key)))))


(defn compile-dsl [d bid terms]
  (let [env (new-bindings)
        ;; side effecting
        z (bset2 env
                 'db d
                 'bid bid
                 'empty [])
        _ (bind-names env {'return-channel [1]
                         'op [0]})
        p (compile-conjunction env terms (fn [] (fn [] ())))]
    (p)
    (vals (get @env 'blocks))))
    ;; emit blocks
    ;; wrap the main block
