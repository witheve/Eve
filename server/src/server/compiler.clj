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
    (bind-names e {name r}) 
    (bset e 'register (+ r 1))))

(defn compose [& gens]
  (fn [] (apply concat (map (fn [x] (let [k (x)] k)) gens))))

;; is lookup always the right thing here?
;; term is a fragment i guess, to shortcut some emits (?)
(defn term [e op & terms]
  (fn [] (list (conj (map (fn [x] (lookup e x)) terms) op))))


(defn generate-send [e channel arguments]
  (let [[out args] (if  (> (count arguments) 0)
                     (let [out (gensym 'tuple)]
                       (allocate-register e out)
                       [out (apply term e 'tuple out arguments)])
                     ['empty ()])]
    (add-dependency e channel)  ;; iff channel is free
    (apply add-dependency e arguments)
    (fn []
      (let [cycle-filters (map (fn [x] (term e 'filter x))
                               (set/difference (bget e 'cycles)
                                           (bget e 'cycle-heads)))]
        ((apply compose (concat cycle-filters (list args) (list (term e 'send channel out)))))))))

;; inside is a function which takes the inner environment
(defn generate-bind [e inside inputs channel-name]
  (let [tuple-target-name (gensym 'closure-tuple)
        input-map (zipmap inputs (range (count inputs)))
        inside-env (new-bindings)
        k (do
            (bset inside-env 'db (bget e 'db))
            (swap! inside-env assoc 'bound (@e 'bound)))
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

(defn generate-union [e arms down]
  (println "union" arms down)
  (fn []
    (cond (= (count arms) 0) down
          (= (count arms) 1) (compose (first arms) down)
          :default 
          (let [cid (gensym 'union-channel)]
            (generate-bind e
                           ;; subqueries..you know you want em
                           (fn [x] (apply compose arms))
                           ;; references that arrive from above the union should maybe be treated seperately
                           (bget down 'references) 
                           cid)))))
              
(declare compile-conjunction)

(defn compile-return [e terms]
  (generate-send e 'return-channel (second terms)))

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
(defn compile-edb [e triple down]
  (println "edb" triple (map type triple))
  (println "bindo" (map (fn [x] (is-bound? e x)) triple))
  (let [[bound free] (partition-2 (fn [x] (is-bound? e (nth triple x))) (range 3))
        [specoid index-inputs index-outputs] [3 () '(0 1 2)]
        argmap (zipmap (range (count triple)) triple)
        channel-name (gensym 'edb-channel)
        index-name (gensym 'edb-index)
        k (println "edb" index-outputs bound free)
        filter-terms (set/intersection (set index-outputs) (set bound))
        extra-map (zipmap filter-terms (map (fn [x] (gensym 'temp)) filter-terms))
        body (fn [x]
               (println "edb" extra-map free argmap (zipmap free (map argmap free)))
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
     (term e 'open index-name specoid channel-name)
     ;; this should be index outputs
     (generate-bind e body free channel-name)
     (generate-send e index-name bound))))


;; unification across the keyword-value bindings (?)
;; staple the down on the head, return the right
(defn compile-implication [e terms down]
  (let [relname (name (first terms))
        callmap (apply hash-map (rest terms))
        sig (db/implication-identifier relname (keys callmap))
        arms (atom ())
        bound (reduce (fn [b x] (if (bget e 'bound (callmap x)) (conj b x) b)) () (keys callmap))]
     
    (db/for-each-implication (bget e 'db) sig
                          (fn [keymap body]
                            ;; there is a clearer way to reset bound - this should be a clean scope
                            (let [internal (new-bindings)
                                  p (bset internal 'db (bget e 'db))
                                  z (println "zig" keymap bound (map keymap bound))
                                  ;; side effects
                                  ;; k (bind-names internal (zipmap projected))
                                  down (compile-conjunction internal body)
                                  ;; merge these guys
                                  exported (bind-names down (keys keymap))])))
    (generate-union e @arms down)))
    


(defn compile-insert [e terms cont]
  )

(defn compile-query [e terms cont]
  ;; this has a better formulation in the new world? what about export
  ;; of solution? what about its projection?
  ;; the bindings of the tail need to escape, but not the
  ;; control edge (cardinality)
  (let [e (compile-conjunction e (rest terms))]
    (bset e 'generator (fn [bottom e] (list (list 'subquery bottom))))))


(defn edb-shaped [t]
  (and (= (count t) 3)
       (not (reduce (fn [b x] (or b (= (type x) clojure.lang.Keyword))) false t))))

(defn implication-shaped [t]
  (and (odd? (count t))
       (reduce (fn [b x] (and b (= (type x) clojure.lang.Keyword))) true (take-nth 2 (rest t)))
       (not (reduce (fn [b x] (or  b (= (type x) clojure.lang.Keyword))) false (take-nth 2 t)))))

(defn compile-expression [e terms down]
  (let [commands {'+ compile-simple-primitive
                  '* compile-simple-primitive
                  'sort compile-simple-primitive ;; ascending and descending
;                  'sum compile-sum
                  'str compile-simple-primitive
                  'insert compile-insert
                  'range compile-simple-primitive
                  ;; consider whether we want the real whole milk relational equal
                  'equal generate-binary-filter
                  'not-equal generate-binary-filter
                  'return compile-return
                  'query compile-query
                  'less-than generate-binary-filter}
        relname (first terms)]
    (if-let [c (commands relname)]
      (c e terms)
      (if (edb-shaped terms)
        (compile-edb e terms down)
        (if (implication-shaped terms)
          (compile-implication e terms down)
          (compile-error "symtax errno"))))))

(defn compile-conjunction [e terms]
  (if (empty? terms) (fn [] ())
      (compile-expression e (first terms)
                          (fn [ed] (compile-conjunction ed (rest terms))))))


(defn compile-dsl [db bid terms]
  (println "compile dsl" terms)
  (let [e (new-bindings)
        ;; side effecting
        z (bset2 e
                 'db db
                 'bid bid
                 'empty [])
        f (bind-names e {'return-channel [1]})
        p (compile-conjunction e terms)
        out (p)]
    out))
