(ns server.compiler
  (:require
   [server.util :refer [merge-state partition-2]]
   [server.db :as db]
   [server.edb :as edb]
   [server.exec :as exec]
   [clojure.set :as set]
   [clojure.string :as string]
   [clojure.pprint :refer [pprint]]))

(defn build [& a]
  (doall (apply concat a)))

(defn compile-error [message data]
  (throw (ex-info message (assoc data :type "compile"))))

(defn get-signature
  "Gets a readable identifier for the given adornment of a relation"
  [relation input output]
  (let [input (sort input)
        output (sort output)]
    (str relation "|" (string/join "," input) "|" (string/join "," output))))

(defn indirect-bind [slot m]
  (zipmap (vals m) (map (fn [x] [slot x]) (keys m))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Environment Management
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn lookup
  "Resolves variables to registers and returns constants in the emit stage"
  [env name]
  (if (or (symbol? name) (keyword? name))
    (or
     (get-in @env ['bound name] nil)
     (when (= '* name) '*))
    name))

(defn is-bound? [env name]
  "Returns true if name is bound in the current env"
  (if (or (symbol? name) (keyword? name))
    (if (or (get-in @env ['bound name] nil) (= name '*))
      true
      false)
    name))

(defn add-dependencies [env & names]
  (swap! env
         #(merge-with merge-state %1 {'dependencies (set (filter symbol? names))})))

(defn bind-names
  "Merges a map of [name register] pairs into the 'bound map of env"
  [env names]
  (when (some nil? (keys names)) (compile-error "Invalid variable name nil", {:env @env :names names}))
  (when (some (comp not vector?) (vals names)) (compile-error "Invalid variable value", {:env @env :names names :bound (get @env 'bound nil)}))
  (swap! env #(merge-with merge-state %1 {'bound names})))

;; this overflow register set probably isn't the best plan, but its
;; likely better than the 'overwrite the registers on startup with
;; a sufficiently large set
(defn allocate-register
  "Allocates a new register in env and binds it to name"
  [env name]
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

(defn bind-outward
  "Binds the set of outputs from the inner-env into env"
  [env inner-env]
  (doseq [name (get @inner-env 'output [])]
    (when-not (is-bound? env name)
      (println "<<BIND" (get @env 'name) name (get @env 'register exec/initial-register))
      (allocate-register env name)
      ;; (let [prev (lookup inner-env name)
      ;;       tmp-name (symbol (str "tmp-" (first prev)))
      ;;       cur (if-let [cur (lookup env tmp-name)]
      ;;             (first cur)
      ;;             (get @env 'register exec/initial-register))
      ;;       reg (into [cur] (rest prev))]
      ;;   (if (> (count prev) 1)
      ;;     (do (when-not (is-bound? env tmp-name)
      ;;           (allocate-register env tmp-name))
      ;;         (bind-names env {name (into [cur] (rest reg))}))
      ;;     (allocate-register env name))
      ;;   (println "<<BIND" (get @env 'name) name cur))
    )))

(defn new-env
  "Creates a new top level compilation environment"
  [db projection]
  (atom {'name "main" 'db db 'input [] 'output projection}))

(defn env-from
  "Creates an inner environment with bindings to the names in its projection bound in the parent"
  [env projection & [name]]
  (let [db (get @env 'db)
        [bound free] (partition-2 #(is-bound? env %1) projection)
        name (get-signature name bound free)
        inner-env (atom {'name name 'db db 'input bound 'output free})]
    (doseq [name bound]
      (println ">>BIND" name (get @inner-env 'register exec/initial-register))
      (allocate-register inner-env name))
    inner-env))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; WEASL Generation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

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
        _ (println " SENDING" arguments "to\n"
                   "INNER" (get @inner-env 'name) (get @inner-env 'bound []) "->\n"
                   "OUTER" (get @env 'name) (get @env 'bound []))
        input (map #(lookup inner-env %1) arguments)
        scope (concat taxi-slots input)]
    (when (some nil? input)
      (compile-error "Cannot send unbound/nil argument" {:env @env :target target :arguments arguments :bound (get @env 'bound nil)}))
    (concat
     (apply term env 'tuple exec/temp-register exec/op-register [(exec/taxi-register 0) (exec/taxi-register 0)] nil scope)
     [(list 'send target exec/temp-register)])))

(defn generate-binary-filter [env terms down]
  (let [argmap (apply hash-map (rest terms))]
    (apply add-dependencies env terms)
    (let [r  (build
             (term env (first terms) exec/temp-register (argmap :a) ( argmap :b))
             (term env 'filter exec/temp-register)
             (down))]
      r)))

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

(defn make-continuation
  "Creates a new block that resumes execution in the scope of the given env from a child env"
  [env name body]
  (swap! env #(merge-with merge-state %1 {'blocks {name (list 'bind name body)}})))

(defn make-bind
  "Creates a new block that executes in the scope of inner-env"
  [env inner-env name body]
  (let [over (get @inner-env 'overflow)
        body (if over
               (build body (term @inner-env 'tuple [(- exec/basic-register-frame 1)] (repeat over nil)))
               body)]
    (swap! env update-in ['blocks] concat (get @inner-env 'blocks))
    (make-continuation env name body)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; WEASL Compilation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(declare compile-conjunction)

(defn compile-query [env terms down]
  (let [[query proj & body] terms
        inner-env (env-from env proj (gensym "query"))
        {name 'name input 'input output 'output} @inner-env
        tail-name (str name "-cont")
        body (compile-conjunction inner-env body (fn [] (generate-send-cont env inner-env tail-name output)))]
    (bind-outward env inner-env)
    (make-continuation env tail-name (down))
    (make-bind env inner-env name body)
    (generate-send env name input)))

(defn compile-union [env terms down]
  (let [[_ proj & arms] terms
        [input output] (partition-2 (fn [x] (is-bound? env x)) proj)
        name (get-signature (gensym "union") input output)
        tail-name (str name "-cont")
        body (apply build
                    (map-indexed
                     #(let [inner-env (env-from env proj)
                            arm-name (str name "-arm" %1)
                            _ (swap! inner-env assoc 'name arm-name)
                            body (rest (rest %2))
                            body (compile-conjunction inner-env body
                                                      (fn [] (generate-send-cont env inner-env tail-name output)))]
                            (bind-outward env inner-env)
                            (make-bind env inner-env arm-name body)
                            (generate-send env arm-name input))
                     arms))]
    (make-continuation env tail-name (down))
    body))

(defn compile-implication [env terms down]
  (let [relname (name (first terms))
        call-map (apply hash-map (rest terms))
        env-map (set/map-invert call-map)
        proj (keys call-map)
        arms (atom ())
        [input output] (partition-2 (fn [x] (is-bound? env (x call-map))) proj)
        inner-name (get-signature (gensym relname) (map env-map input) (map env-map output))
        tail-name (str inner-name "-cont")
        army (fn [parameters body ix]
               (let [arm-name (str inner-name "-arm" ix)
                     inner-env (env-from env proj)
                     _ (println "kreg" output)
                     body (compile-conjunction inner-env body (fn [] (generate-send-cont
                                                                      env
                                                                      inner-env
                                                                      tail-name
                                                                      (doall (map (comp symbol name) output)))))]
                 (bind-outward env inner-env)
                 (make-bind env inner-env arm-name body)
                 arm-name))]

    ;; validate the parameters as both a proper superset of the input
    ;; and conformant across the union arms
    (db/for-each-implication (get @env 'db) relname
                             (fn [parameters body]
                               (swap! arms conj (army parameters body (count @arms)))))
    (make-continuation env tail-name (down))
    ;; @FIXME: Dependent on synchronous evaluation: expects for-each-implication to have completed
    (apply build (map #(generate-send env %1 (map call-map input)) @arms))))

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
     (term env (first terms) (:return argmap) (:a argmap) (map #(lookup env %1) grouping))
     (down))))

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
  (when-not (= (first terms) 'query)
    (compile-error "Top level form must be query"))
  (let [proj (second terms)
        env (new-env d proj) ;; @FIXME: with projection of top level query
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
