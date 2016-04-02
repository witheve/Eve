(ns server.compiler
  (:require
   [server.db :as db]
   [server.edb :as edb]
   [server.exec :as exec]
   [clojure.set :as set]
   [clojure.string :as string]
   [clojure.pprint :refer [pprint]]))



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


(defn new-env [db]
  (let [env (atom {})]
    (swap! env assoc 'db db)
    env))

(declare allocate-register)

(defn env-from [parent-env projection]
  (let [db (get @parent-env 'db)
        [bound free] (partition-2 #(is-bound? parent-env %1) projection)
        env (atom {'db db 'input bound 'output free})]
    (doseq [name bound]
      (println ">>BIND" name (get @env 'register exec/initial-register))
      (allocate-register env name))
    env))

;; wrap a handler
(defn compile-error [message data]
  (throw (ex-info message (assoc data :type "compile"))))

;; lookup happens in the emit stage, it returns either a constant value, or the register
;; which is currently holding that value
(defn lookup [env name]
  (if (or (symbol? name) (keyword? name))
    (or
     (get-in @env ['bound name] nil)
     (when (= '* name) '*))
    name))

(defn is-bound? [env name]
  (if (or (symbol? name) (keyword? name))
    (if (or (get-in @env ['bound name] nil) (= name '*))
      true
      false)
    name))

(defn add-dependencies [env & names]
  (swap! env
         #(merge-with merge-state %1 {'dependencies (set (filter symbol? names))})))

(defn bind-names [env names]
  (when (some nil? (keys names)) (compile-error "Invalid variable name nil", {:env @env :names names}))
  (when (some (comp not vector?) (vals names)) (compile-error "Invalid variable value", {:env @env :names names :bound (get @env 'bound nil)}))
  (swap! env
         #(merge-with merge-state %1 {'bound names})))

;; this overflow register set probably isn't the best plan, but its
;; likely better than the 'overwrite the registers on startup with
;; a sufficiently large set
(defn allocate-register [env name]
  (let [bound (- exec/basic-register-frame 1)
        r (get @env 'register exec/initial-register)]
    (if (> r (- bound 1))
      (let [r (get @env 'overflow 0)]
        (bind-names env {name [bound r]})
        (swap! env #(assoc %1 'overflow (inc r)))
        [bound r])
      (do
        (swap! env #(assoc %1 'register (inc r)))
        (bind-names env {name [r]})
        r))))

(defn bind-outward [env inner-env]
  (doseq [name (get @inner-env 'output [])]
    (when-not (is-bound? env name)
      (let [prev (lookup inner-env name)
            tmp-name (symbol (str "tmp-" (first prev)))
            cur (if-let [cur (lookup env tmp-name)]
                  (first cur)
                  (get @env 'register exec/initial-register))
            reg (into [cur] (rest prev))]
        (if (> (count prev) 1)
          (do (when-not (is-bound? env tmp-name)
                (allocate-register env tmp-name))
              (bind-names env {name (into [cur] (rest reg))}))
          (allocate-register env name))
        (println "<<BIND" name cur)))))

(defn term [env op & terms]
  (list (conj (map (fn [x] (lookup env x)) terms) op)))

(defn generate-send
  "Generates a send which saves the current register so it can be restored via continuation"
  [env target arguments]
  (apply add-dependencies env arguments)
  (when (some nil? (map #(lookup env %1) arguments))
    (compile-error "Cannot send unbound/nil argument" {:env @env :target target :arguments arguments :bound (get @env 'bound nil)}))
  (concat
   (apply term env 'tuple exec/temp-register exec/op-register '* nil (map #(lookup env %1) arguments))
   [(list 'send target exec/temp-register)]))

(defn generate-send-cont
  "Generates a continuation send which pops and restores the scope of the parent environment"
  [env inner-env target arguments]
  (let [;bound-pairs (sort-by (comp first second) (get @env 'bound {}))
        ;taxi-slots (map (fn [[name slot]] (vec (concat exec/taxi-register slot))) bound-pairs)
        taxi-slots (map (fn [i] [(exec/taxi-register 0) i]) (drop exec/initial-register (range (get @env 'register exec/initial-register))))
        input (map #(lookup inner-env %1) arguments)
        scope (concat taxi-slots input)]
    (when (some nil? input)
      (compile-error "Cannot send unbound/nil argument" {:env @env :target target :arguments arguments :bound (get @env 'bound nil)}))
    (concat
     (apply term env 'tuple exec/temp-register exec/op-register [(exec/taxi-register 0) (exec/taxi-register 0)] nil scope)
     [(list 'send target exec/temp-register)])))

(declare compile-conjunction)

(defn compile-simple-primitive [env terms down]
  (let [argmap (apply hash-map (rest terms))
        simple [(argmap :return) (argmap :a) (argmap :b)]
        ins (map #(get-in @env ['bound %1] nil) simple)]
    (apply add-dependencies env (rest (rest terms)))
    (if (some not (rest ins))
      ;; handle the [b*] case by blowing out a temp
      (do
        (allocate-register env (first simple))
        (build
         (apply term env (first terms) simple)
         (down)))
      (compile-error (str "unhandled bound signature in" terms) {:env env :terms terms}))))

(defn compile-sum [env terms down]
  (let [grouping (get @env 'input [])
        argmap (apply hash-map (rest terms))]
    (when-not (lookup env (:a argmap))
      (compile-error (str "unhandled bound signature in" terms) {:env env :terms terms}))
    (when-not (lookup env (:return argmap))
      (allocate-register env (:return argmap)))
    (build
     (term env (first terms) (:return argmap) (:a argmap) grouping)
     (down))))

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
        amap (apply hash-map (rest terms))
        used (keys amap)
        pmap (zipmap signature (range (count signature)))
        pmap (select-keys pmap used)
        [bound free] (partition-2 (fn [x] (is-bound? env (amap x))) used)
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
        callmap (apply hash-map (rest terms))
        proj (keys callmap)
        arms (atom ())
        [bound free] (partition-2 (fn [x] (is-bound? env (x callmap))) proj)
        signature (get-signature relname callmap bound)
        tail-name (gensym "continuation")
        army (fn [parameters body]
               (let [arm-name (gensym signature)
                     inner-env (env-from env proj)
                     body (compile-conjunction inner-env body (fn [] (generate-send-cont env inner-env tail-name (map #(symbol (name %1)) free))))]
                 (bind-outward env inner-env)
                 (make-bind env inner-env arm-name body)
                 arm-name))]

    ;; validate the parameters as both a proper superset of the input
    ;; and conformant across the union legs
    (db/for-each-implication (get @env 'db) relname
                             (fn [parameters body]
                               (swap! arms conj (army parameters body))))


    (make-continuation env tail-name (down))
    (apply build (map #(generate-send env %1 (map callmap bound)) @arms))))

(defn compile-union [env terms down]
  (let [[_ proj & arms] terms
        tail-name (gensym "continuation")
        [bound free] (partition-2 (fn [x] (is-bound? env x)) proj)
        body (apply build
                    (map #(let [arm-name (gensym "arm")
                                inner-env (env-from env proj)
                                body (rest (rest %1))
                                body (compile-conjunction inner-env body (fn [] (generate-send-cont env inner-env tail-name free)))]
                            (bind-outward env inner-env)
                            (make-bind env inner-env arm-name body)
                            (generate-send env arm-name bound)) arms))]
    (make-continuation env tail-name (down))
    body))


(defn compile-not [env terms down]
  (build
   (list (list 'not (compile-conjunction env (rest terms) (fn [] ()))))
   (down)))

(defn compile-insert [env terms down]
  (let [bindings (apply hash-map (rest terms))
        e (if-let [b (bindings :entity)] b nil)
        a (if-let [b (bindings :attribute)] b nil)
        v (if-let [b (bindings :value)] b nil)
        t (if-let [b (bindings :value)] b nil)
        ;; namespace collision with bag, used to have a dedicated register..figure it out
        b (if-let [b (bindings :bag)] b (get-in @env ['bound 'bag]))
        out (if-let [b (bindings :tick)] (let [r (allocate-register env (gensym 'insert-output))]
                                           (bind-names env {b [r 4]})
                                           [r]) [])]

    (let [z (down)]
      (apply build
             (term env 'tuple exec/temp-register e a v b)
             (term env 'scan edb/insert-oid out exec/temp-register)
             (list z)))))

(defn compile-query [env terms down]
  (let [[query proj & body] terms
        inner-env (env-from env proj)
        inner-name (gensym "query")
        tail-name (gensym "continuation")
        [bound free] (partition-2 (fn [x] (is-bound? env x)) proj)
        body (compile-conjunction inner-env body (fn [] (generate-send-cont env inner-env tail-name free)))]

    (make-continuation env tail-name (down))
    (make-bind env inner-env inner-name body)
    (bind-outward env inner-env)
    (generate-send env inner-name bound)))

(defn compile-expression [env terms down]
  (let [commands {'+ compile-simple-primitive
                  '* compile-simple-primitive
                  '/ compile-simple-primitive
                  '- compile-simple-primitive
                  '< generate-binary-filter
                  '> generate-binary-filter
                  'sort compile-simple-primitive ;; ascending and descending
                  'sum compile-sum

                  'str compile-simple-primitive
                  'insert-fact-btu! compile-insert
                  'fact-btu (fn [e terms down]
                              (generate-scan e terms down true))
                  'full-fact-btu (fn [e terms down]
                                   (generate-scan e terms down true))
                  'range compile-simple-primitive
                  '= compile-equal
                  'not compile-not
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
        _ (swap! env assoc 'bag bag)
        p (compile-expression
           ;; maybe replace with zero register? maybe just shortcut this last guy?
           env terms (fn []
                       (println "####" (get @env 'bound))
                       (let [bound (vals (get @env 'bound {}))
                             regs (map #(lookup env %1) bound)]
                         (list
                          (apply list 'tuple exec/temp-register exec/op-register regs)
                          (list 'send 'out exec/temp-register)))))]
    (make-continuation env 'main p)
    (vals (get @env 'blocks))))
