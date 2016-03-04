(ns server.compiler
  (:require
   [server.db :as db]
   [server.exec :as exec]
   [clojure.set :as set]))

;; cardinatity changing operations should set a flag so we know
;; should also be able to retire registers that aren't being referenced
;; anymore...also add the unique flag for downedges that have already
;; been explicitly or implicitly deltad

   
(defn bset [e & key]
  (let [c (count key)]
    (if (= c 2)
      (swap! e assoc (first key) (second key))
      (swap! e assoc (first key) (apply bset (@e (first key)) (rest key))))))

;; multiple kv, no deep keys
(defn bset2 [e & key]
  (when (not (empty? key))
    (bset e (first key) (second key))
    (apply bset2 e (rest (rest key)))))


(defn bget [e & key]
  (let [internal (fn internal [e key]
                   (let [k0 (first key)]
                     (cond
                       (= e nil) nil
                       (and (= (count key) 1) (= (type k0) clojure.lang.PersistentArrayMap)) (keys k0)
                       (= (count key) 1) (e k0)
                       :default (internal (e k0) (rest key)))))]
    (internal @e key)))
    
(defn new-bindings [] (atom {}))

(defn child-bindings [e]
  (let [x (new-bindings)]
    (bset x 'db (bget e 'db))
    (swap! x assoc 'bound (@e 'bound))
    x))

;; wrap a handler
(defn compile-error [& thingy]
  (apply println "compiler error" thingy)
  (throw thingy))

;; lookup happens in the emit stage, it returns either a constant value, or the register
;; which is currently holding that value
(defn lookup [f name]
  (if (or (symbol? name) (keyword? name))
    (bget f 'bound name)
    name))

(defn add-dependency [e & n]
  (swap! e (fn [x] (assoc x 'dependencies (if-let [b (x 'dependencies)] (set/union b n) (set n))))))

;; where vals is a map
(defn bind-names [e n]
  (swap! e (fn [x] (assoc x 'bound (if-let [b (x 'bound)] (merge b n) n)))))

(defn allocate-register [e name]
  (let [r (if-let [r (bget e 'register)] (+ r 1) 0)]
    ;; umm 
    (bind-names e {name [r]}) 
    (bset e 'register (+ r 1))))

;; a generator is a null-adic function which spits out weasel using
;; the (possibly updated) environment that was captured at the
;; time it was compiled
(defn compose [& gens]
  (fn [] (apply concat (map (fn [x] (let [k (x)] k)) gens))))

;; is lookup always the right thing here?
;; term is a fragment i guess, to shortcut some emits (?)
(defn term [e op & terms]
  (fn [] (list (conj (map (fn [x] (lookup e x)) terms) op))))


(defn generate-send [e channel arguments]
  (let [[out tup] (if  (> (count arguments) 0)
                     (let [out (gensym 'tuple)]
                       (allocate-register e out)
                       [out (list (apply term e 'tuple out arguments))])
                     ['empty ()])]
    (add-dependency e channel)  ;; iff channel is free
    (apply add-dependency e arguments)
    (fn []
      (let [cycle-filters (map (fn [x] (term e 'filter x))
                               (set/difference (bget e 'cycles)
                                               (bget e 'cycle-heads)))]
        ((apply compose (concat cycle-filters tup (list (term e 'send channel out)))))))))

;; inside is a function which takes the inner environment
(defn generate-bind [e inside inputs channel-name]
  (let [tuple-target-name (gensym 'closure-tuple)
        input-map (zipmap inputs (range (count inputs)))
        inside-env (child-bindings e)
        body (inside inside-env)
        ;; xxx - this needs to only apply to terms that aren't added here
        tuple-names (reduce
                     (fn [b x]
                       (when (bget e 'bound x)
                         (bind-names inside-env {x [1 (count b)]})
                         (conj b (if (bget e 'bound x) x ()))))
                     ()
                     (bget inside-env 'dependencies))]
    (if (> (count tuple-names) 0)
      (do
        (allocate-register e tuple-target-name)
        (compose (apply term e 'tuple tuple-target-name tuple-names)
                 (term e 'bind channel-name tuple-target-name (body))))
      (term e 'bind channel-name [] (body)))))

;; an arm is a environment/generator pair
(defn generate-union [e signature arms down]
  (cond (= (count arms) 0) (down e)
        (= (count arms) 1) ((first arms) e down)
        :default 
        (let [cid (gensym 'union-channel)]
          (apply compose (concat (map (fn [x]
                                        ;; subquery
                                        (x e (fn [e] (generate-send e cid signature))))
                                      arms)
                                 (list (generate-bind e down signature cid)))))))
              
(declare compile-conjunction)

(defn compile-return [e terms down]
  (compose
   (generate-send e 'return-channel (second terms))
   (down e)))

(defn compile-simple-primitive [e terms rest]
  (let [ins (map (fn [x] (bget e 'bound x)) (rest terms))]
    (if (some not (rest ins))
      ;; handle the [b*] case by blowing out a temp
      (do 
        (allocate-register e (second terms))
        (fn [] (apply list (first terms) (map (fn [x] (lookup e x)) (rest terms))))))))


(defn generate-binary-filter [e terms]
  (let [tsym (gensym 'filter)]
    (allocate-register e tsym)
    (fn []
      ((compose 
        (apply term e (first terms) tsym (rest terms))
        (term e 'filter tsym))))))

;; really the same as lookup...fix
(defn is-bound? [e name]
  (if (or (symbol? name) (keyword? name))
    (bget e 'bound name)
    name))

(defn partition-2 [pred coll]
  ((juxt
    (partial filter pred)
    (partial filter (complement pred)))
     coll))

(defn indirect-bind [slot m]
  (zipmap (vals m) (map (fn [x] [2 x]) (keys m))))

;; figure out how to handle the quintuple
;; need to do index selection here - resolve attribute name
(defn compile-edb [e terms down]
  ;; sexy machine is supposed to deconstruct the multi
  (let [triple (rest terms)
        [bound free] (partition-2 (fn [x] (is-bound? e (nth triple x))) (range 3))
        [specoid index-inputs index-outputs] [3 () '(0 1 2)]
        ;; ech
        argmap {0 (first triple) 1 (name (second triple)) 2 (nth triple 2)}
        channel-name (gensym 'edb-channel)
        index-name (gensym 'edb-index)
        filter-terms (set/intersection (set index-outputs) (set bound))
        extra-map (zipmap filter-terms (map (fn [x] (gensym 'temp)) filter-terms))
        body (fn [x]
               (bind-names x (indirect-bind 2 extra-map))
               (bind-names x (indirect-bind 2 (zipmap free (map argmap free))))
               (apply compose (concat (map (fn [t]
                                             (generate-binary-filter x
                                                                     (list 'equal (extra-map t)
                                                                           (is-bound? x (nth triple t)))))
                                           filter-terms)
                                      (list (down x)))))]
    

    (allocate-register e channel-name) 
    (allocate-register e index-name)

    (compose
     ;; we decided to float these to the top
     (generate-bind e body free channel-name)
     (term e 'open index-name specoid channel-name)
     ;; this should be index outputs
     (generate-send e index-name bound))))


;; unification across the keyword-value bindings (?)
(defn compile-implication [e terms down]
  (let [relname (name (first terms))
        dekey (fn [x] (symbol (name x)))
        callmap (apply hash-map (rest terms))
        arms (atom ())
        ibinds (reduce-kv
                (fn [b k v] (if-let [v (lookup e v)] (assoc b k v) b))
                {} callmap)
        ;; in caller space
        outputs (set/difference (set (keys callmap)) (set (keys ibinds)))

        army (fn [parameters body]
               (fn [e down]
                 (let [internal (child-bindings e)]
                   ;; bind those names where the colon is ripped off
                   (bind-names internal (zipmap (map dekey (keys ibinds)) (vals ibinds)))
                   (compile-conjunction
                    internal body
                    (fn [e]
                      (let [out (child-bindings e)]
                        ;; we translate this back into the external namespace soley
                        ;; to support the 1-ary case, otherwise union would take care
                        ;; of it
                        (bind-names out (zipmap (map callmap outputs)
                                                (map (fn [x] (bget e 'bound (dekey x))) outputs)))
                        (down out)))))))]

    ;; validate the parameters as both a proper superset of the input
    ;; and conformant across the union legs
    (db/for-each-implication (bget e 'db) relname 
                             (fn [parameters body]
                               (swap! arms conj (army parameters body))))
    (generate-union e outputs @arms down)))


(defn compile-insert [e terms cont]
  (let [channel-name (gensym 'insert-channel)]
    (allocate-register e channel-name)
    (apply compose 
           (term e 'open channel-name db/insert-oid)
           (map (fn [x] (generate-send e channel-name
                                       (list (nth x 0) (name (nth x 1)) (nth x 2))))
                (rest terms)))))


(defn compile-union [e terms down]
  ;; these need to be lambda [e down]
  (generate-union (apply hash-map (second terms)) (rest (rest terms)) down))


(defn compile-sum [e triple down]
  ())

(defn compile-query [e terms cont]
  ;; this has a better formulation in the new world? what about export
  ;; of solution? what about its projection?
  ;; the bindings of the tail need to escape, but not the
  ;; control edge (cardinality)
  (let [e (compile-conjunction e (rest terms) (fn [e] (fn [] ())))]
    (bset e 'generator (fn [bottom e] (list (list 'subquery bottom))))))

(defn compile-expression [e terms down]
  (let [commands {'+ compile-simple-primitive
                  '* compile-simple-primitive
                  'sort compile-simple-primitive ;; ascending and descending
                  'sum compile-sum
                  'str compile-simple-primitive
                  'insert-fact! compile-insert
                  'fact compile-edb
                  'range compile-simple-primitive
                  ;; consider whether we want the real whole milk relational equal
                  'equal generate-binary-filter
                  'not-equal generate-binary-filter
                  'union compile-union
                  'return compile-return
                  'query compile-query
                  'less-than generate-binary-filter}
        relname (first terms)]
    (if-let [c (commands relname)]
      (c e terms down)
      (compile-implication e terms down))))

(defn compile-conjunction [e terms down]
  (if (empty? terms) (down e)
      (compile-expression e (first terms)
                          (fn [ed] (compile-conjunction ed (rest terms) down)))))


(defn compile-dsl [db bid terms]
  (println "compile dsl" terms)
  (let [e (new-bindings)
        ;; side effecting
        z (bset2 e
                 'db db
                 'register 3 ; fix
                 'bid bid
                 'empty [])
        f (bind-names e {'return-channel [1]})
        p (compile-conjunction e terms (fn [e] (fn [] ())))
        out (p)]
    (print (exec/print-program out))
    out))
