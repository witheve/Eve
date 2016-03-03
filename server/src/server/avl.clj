(ns fabric.avl

  "An implementation of persistent sorted maps and sets based on AVL
  trees which can be used as drop-in replacements for Clojure's
  built-in sorted maps and sets based on red-black trees. Apart from
  the standard sorted collection API, the provided map and set types
  support the transients API and several additional logarithmic time
  operations: rank queries via clojure.core/nth (select element by
  rank) and clojure.data.avl/rank-of (discover rank of element),
  \"nearest key\" lookups via clojure.data.avl/nearest, splits by key
  and index via clojure.data.avl/split-key and
  clojure.data.avl/split-at, respectively, and subsets/submaps using
  clojure.data.avl/subrange."

  {:author "Michał Marczyk"}

  (:refer-clojure :exclude [sorted-map sorted-map-by sorted-set sorted-set-by
                            range split-at])
  (:import (clojure.lang RT Util APersistentMap APersistentSet
                         IPersistentMap IPersistentSet IPersistentStack
                         Box MapEntry SeqIterator)
           (java.util Comparator Collections ArrayList)
           (java.util.concurrent.atomic AtomicReference)))

(set! *warn-on-reflection* true)
(set! *unchecked-math* :warn-on-boxed)

(defn ^:private throw-unsupported []
  (throw (UnsupportedOperationException.)))

(defmacro ^:private caching-hash [coll hash-fn hash-key]
  `(let [h# ~hash-key]
     (if-not (== h# (int -1))
       h#
       (let [h# (~hash-fn ~coll)]
         (set! ~hash-key (int h#))
         h#))))

(defmacro ^:private compile-if [test then else]
  (if (eval test)
    then
    else))

(def ^:private ^:const empty-set-hashcode (.hashCode #{}))
(def ^:private ^:const empty-set-hasheq   (hash #{}))
(def ^:private ^:const empty-map-hashcode (.hashCode {}))
(def ^:private ^:const empty-map-hasheq   (hash {}))

(defn ^:private hash-imap
  [^IPersistentMap m]
  (APersistentMap/mapHash m))

(defn ^:private hasheq-imap
  [^IPersistentMap m]
  (compile-if (resolve 'clojure.core/hash-unordered-coll)
    (hash-unordered-coll m)
    (APersistentMap/mapHasheq m)))

(defn ^:private hash-iset [^IPersistentSet s]
  ;; a la clojure.lang.APersistentSet
  (loop [h (int 0) s (seq s)]
    (if s
      (let [e (first s)]
        (recur (unchecked-add-int h (if (nil? e) 0 (.hashCode ^Object e)))
               (next s)))
      h)))

(defn ^:private hasheq-iset [^IPersistentSet s]
  (compile-if (resolve 'clojure.core/hash-unordered-coll)
    (hash-unordered-coll s)
    (loop [h (int 0) s (seq s)]
      (if s
        (recur (unchecked-add-int h (Util/hasheq (first s)))
               (next s))
        h))))

(defn ^:private hash-seq
  [s]
  (loop [h (int 1) s (seq s)]
    (if s
      (recur (unchecked-add-int (unchecked-multiply-int (int 31) h)
                                (if (nil? (first s))
                                  (int 0)
                                  (.hashCode ^Object (first s))))
             (next s))
      h)))

(defn ^:private hasheq-seq
  [s]
  (compile-if (resolve 'clojure.core/hash-ordered-coll)
    (hash-ordered-coll s)
    (loop [h (int 1) s (seq s)]
      (if s
        (recur (unchecked-add-int (unchecked-multiply-int (int 31) h)
                                  (Util/hasheq (first s)))
               (next s))
        h))))

(defn ^:private equiv-sequential
  "Assumes x is sequential. Returns true if x equals y, otherwise
  returns false."
  [x y]
  (boolean
   (when (sequential? y)
     (loop [xs (seq x) ys (seq y)]
       (cond (nil? xs) (nil? ys)
             (nil? ys) false
             (= (first xs) (first ys)) (recur (next xs) (next ys))
             :else false)))))

(def ^:private never-equiv (Object.))

(defn ^:private equiv-map
  "Assumes x is a map. Returns true if y equals x, otherwise returns
  false."
  [^clojure.lang.IPersistentMap x y]
  (if-not (instance? java.util.Map y)
    false
    (if (and (instance? clojure.lang.IPersistentMap y)
             (not (instance? clojure.lang.MapEquivalence y)))
      false
      (let [m ^java.util.Map y]
        (if-not (== (.size ^java.util.Map x) (.size m))
          false
          (reduce-kv (fn [t k v]
                       (if-not (.containsKey m k)
                         (reduced false)
                         (if-not (Util/equiv v (.get m k))
                           (reduced false)
                           t)))
                     true
                     x))))))

(gen-interface
 :name clojure.data.avl.IAVLNode
 :methods
 [[getKey    []                          Object]
  [setKey    [Object]                    clojure.data.avl.IAVLNode]
  [getVal    []                          Object]
  [setVal    [Object]                    clojure.data.avl.IAVLNode]
  [getLeft   []                          clojure.data.avl.IAVLNode]
  [setLeft   [clojure.data.avl.IAVLNode] clojure.data.avl.IAVLNode]
  [getRight  []                          clojure.data.avl.IAVLNode]
  [setRight  [clojure.data.avl.IAVLNode] clojure.data.avl.IAVLNode]
  [getHeight []                          int]
  [setHeight [int]                       clojure.data.avl.IAVLNode]
  [getRank   []                          int]
  [setRank   [int]                       clojure.data.avl.IAVLNode]])

(gen-interface
 :name clojure.data.avl.IAVLTree
 :methods [[getTree [] clojure.data.avl.IAVLNode]])

(import (clojure.data.avl IAVLNode IAVLTree))

(definterface INavigableTree
  (nearest [test k]))

(deftype AVLNode [^AtomicReference edit
                  ^:unsynchronized-mutable key
                  ^:unsynchronized-mutable val
                  ^:unsynchronized-mutable ^IAVLNode left
                  ^:unsynchronized-mutable ^IAVLNode right
                  ^:unsynchronized-mutable ^int height
                  ^:unsynchronized-mutable ^int rank]
  IAVLNode
  (getKey [this]
    key)

  (setKey [this k]
    (set! key k)
    this)

  (getVal [this]
    val)

  (setVal [this v]
    (set! val v)
    this)

  (getLeft [this]
    left)

  (setLeft [this l]
    (set! left l)
    this)

  (getRight [this]
    right)

  (setRight [this r]
    (set! right r)
    this)

  (getHeight [this]
    height)

  (setHeight [this h]
    (set! height h)
    this)

  (getRank [this]
    rank)

  (setRank [this r]
    (set! rank r)
    this)

  Object
  (equals [this that]
    (cond
      (identical? this that) true

      (or (instance? clojure.lang.IPersistentVector that)
          (instance? java.util.RandomAccess that))
      (and (== 2 (count that))
           (.equals key (nth that 0))
           (.equals val (nth that 1)))

      (or (instance? clojure.lang.Sequential that)
          (instance? java.util.List that))
      (and (== 2 (count that))
           (.equals key (first that))
           (.equals val (second that)))

      :else false))

  (hashCode [this]
    (-> (int 31)
        (unchecked-add-int (Util/hash key))
        (unchecked-multiply-int (int 31))
        (unchecked-add-int (Util/hash val))))

  (toString [this]
    (pr-str this))

  clojure.lang.IHashEq
  (hasheq [this]
    (compile-if (resolve 'clojure.core/hash-ordered-coll)
      (hash-ordered-coll this)
      (-> (int 31)
          (unchecked-add-int (Util/hasheq key))
          (unchecked-multiply-int (int 31))
          (unchecked-add-int (Util/hasheq val)))))

  clojure.lang.Indexed
  (nth [this n]
    (case n
      0 key
      1 val
      (throw
       (IndexOutOfBoundsException. "nth index out of bounds in AVLNode"))))

  (nth [this n not-found]
    (case n
      0 key
      1 val
      not-found))

  clojure.lang.Counted
  (count [this]
    2)

  clojure.lang.IMeta
  (meta [this]
    nil)

  clojure.lang.IObj
  (withMeta [this m]
    (with-meta [key val] m))

  clojure.lang.IPersistentCollection
  (cons [this x]
    [key val x])

  (empty [this]
    [])

  (equiv [this that]
    (cond
      (or (instance? clojure.lang.IPersistentVector that)
          (instance? java.util.RandomAccess that))
      (and (== 2 (count that))
           (= key (nth that 0))
           (= val (nth that 1)))

      (or (instance? clojure.lang.Sequential that)
          (instance? java.util.List that))
      (and (== 2 (count that))
           (= key (first that))
           (= val (second that)))

      :else false))

  clojure.lang.IPersistentStack
  (peek [this]
    val)

  (pop [this]
    [key])

  clojure.lang.IPersistentVector
  (assocN [this i x]
    (case i
      0 [x val]
      1 [key x]
      (throw
       (IndexOutOfBoundsException. "assocN index out of bounds in AVLNode"))))

  (length [this]
    2)

  clojure.lang.Reversible
  (rseq [this]
    (list val key))

  clojure.lang.Associative
  (assoc [this k v]
    (if (Util/isInteger k)
      (.assocN this k v)
      (throw (IllegalArgumentException. "key must be integer"))))

  (containsKey [this k]
    (if (Util/isInteger k)
      (case (int k)
        0 true
        1 true
        false)
      false))

  (entryAt [this k]
    (if (Util/isInteger k)
      (case (int k)
        0 (MapEntry. 0 key)
        1 (MapEntry. 1 val)
        nil)))

  clojure.lang.ILookup
  (valAt [this k not-found]
    (if (Util/isInteger k)
      (case (int k)
        0 key
        1 val
        not-found)
      not-found))

  (valAt [this k]
    (.valAt this k nil))

  clojure.lang.IFn
  (invoke [this k]
    (if (Util/isInteger k)
      (case (int k)
        0 key
        1 val
        (throw
         (IndexOutOfBoundsException.
          "invoke index out of bounds in AVLNode")))
      (throw (IllegalArgumentException. "key must be integer"))))

  (applyTo [this args]
    (let [n (RT/boundedLength args 1)]
      (case n
        0 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName))))
        1 (.invoke this (first args))
        2 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName)))))))

  clojure.lang.Seqable
  (seq [this]
    (list key val))

  clojure.lang.Sequential

  clojure.lang.IEditableCollection
  (asTransient [this]
    (transient [key val]))

  clojure.lang.IMapEntry
  (key [this]
    key)

  (val [this]
    val)

  java.util.Map$Entry
  (getValue [this]
    val)

  (setValue [this x]
    (throw-unsupported))

  java.io.Serializable

  java.lang.Comparable
  (compareTo [this that]
    (if (identical? this that)
      0
      (let [^clojure.lang.IPersistentVector v
            (cast clojure.lang.IPersistentVector that)
            vcnt (.count v)]
        (cond
          (< 2 vcnt) -1
          (> 2 vcnt) 1
          :else
          (let [comp (Util/compare key (.nth v 0))]
            (if (zero? comp)
              (Util/compare val (.nth v 1))
              comp))))))

  java.lang.Iterable
  (iterator [this]
    (.iterator ^java.lang.Iterable (list key val)))

  java.util.RandomAccess
  java.util.List
  (get [this i]
    (.nth this i))

  (indexOf [this x]
    (condp = x
      key 0
      val 1
      -1))

  (lastIndexOf [this x]
    (condp = x
      val 1
      key 0
      -1))

  (listIterator [this]
    (.listIterator this 0))

  (listIterator [this i]
    (.listIterator (doto (java.util.ArrayList.)
                     (.add key)
                     (.add val))
                   i))

  (subList [this a z]
    (if (<= 0 a z 2)
      (cond
        (== a z) []
        (and (== a 0) (== z 2)) this
        :else (case a
                0 [key]
                1 [val]))
      (throw
       (IndexOutOfBoundsException. "subList index out of bounds in AVLNode"))))

  java.util.Collection
  (contains [this x]
    (or (= key x) (= val x)))

  (containsAll [this c]
    (every? #(.contains this %) c))

  (isEmpty [this]
    false)

  (toArray [this]
    (into-array Object this))

  (toArray [this arr]
    (if (>= (count arr) 2)
      (doto arr
        (aset 0 key)
        (aset 1 val))
      (into-array Object this)))

  (size [this]
    2)

  (add             [this x]      (throw-unsupported))
  (^boolean remove [this x]      (throw-unsupported))
  (addAll          [this c]      (throw-unsupported))
  (clear           [this]        (throw-unsupported))
  (retainAll       [this c]      (throw-unsupported))
  (removeAll       [this c]      (throw-unsupported))
  (set             [this i e]    (throw-unsupported))
  (remove          [this ^int i] (throw-unsupported))
  (add             [this i e]    (throw-unsupported)))

(defn ^:private ensure-editable
  (^IAVLNode [^AtomicReference edit]
     (let [owner (.get edit)]
       (cond
         (identical? owner (Thread/currentThread))
         true

         (nil? owner)
         (throw (IllegalAccessError. "Transient used after persistent! call"))

         :else
         (throw (IllegalAccessError. "Transient used by non-owner thread")))))
  (^IAVLNode [^AtomicReference edit ^AVLNode node]
     (if (identical? edit (.-edit node))
       node
       (AVLNode. edit
                 (.getKey node) (.getVal node)
                 (.getLeft node)
                 (.getRight node)
                 (.getHeight node)
                 (.getRank node)))))

(defn ^:private height ^long [^IAVLNode node]
  (if (nil? node)
    0
    (long (.getHeight node))))

(defn ^:private rotate-left ^IAVLNode [^IAVLNode node]
  (let [l    (.getLeft  node)
        r    (.getRight node)
        rl   (.getLeft  r)
        rr   (.getRight r)
        lh   (height l)
        rlh  (height rl)
        rrh  (height rr)
        rnk  (.getRank node)
        rnkr (.getRank r)]
    (AVLNode. nil
              (.getKey r) (.getVal r)
              (AVLNode. nil
                        (.getKey node) (.getVal node)
                        l
                        rl
                        (inc (max lh rlh))
                        rnk)
              rr
              (max (+ lh 2)
                   (+ rlh 2)
                   (inc rrh))
              (inc (+ rnk rnkr)))))

(defn ^:private rotate-left! ^IAVLNode [edit ^IAVLNode node]
  (let [node (ensure-editable edit node)
        l    (.getLeft  node)
        r    (ensure-editable edit (.getRight node))
        rl   (.getLeft  r)
        rr   (.getRight r)
        lh   (height l)
        rlh  (height rl)
        rrh  (height rr)
        rnk  (.getRank node)
        rnkr (.getRank r)]
    (.setLeft   r node)
    (.setHeight r (max (+ lh 2) (+ rlh 2) (inc rrh)))
    (.setRank   r (inc (+ rnk rnkr)))
    (.setRight  node rl)
    (.setHeight node (inc (max lh rlh)))
    r))

(defn ^:private rotate-right ^IAVLNode [^IAVLNode node]
  (let [r    (.getRight node)
        l    (.getLeft  node)
        lr   (.getRight l)
        ll   (.getLeft  l)
        rh   (height r)
        lrh  (height lr)
        llh  (height ll)
        rnk  (.getRank node)
        rnkl (.getRank l)]
    (AVLNode. nil
              (.getKey l) (.getVal l)
              ll
              (AVLNode. nil
                        (.getKey node) (.getVal node)
                        lr
                        r
                        (inc (max rh lrh))
                        (dec (- rnk rnkl)))
              (max (+ rh 2)
                   (+ lrh 2)
                   (inc llh))
              rnkl)))

(defn ^:private rotate-right! ^IAVLNode [edit ^IAVLNode node]
  (let [node (ensure-editable edit node)
        r    (.getRight node)
        l    (ensure-editable edit (.getLeft  node))
        lr   (.getRight l)
        ll   (.getLeft  l)
        rh   (height r)
        lrh  (height lr)
        llh  (height ll)
        rnk  (.getRank node)
        rnkl (.getRank l)]
    (.setRight  l node)
    (.setHeight l (max (+ rh 2) (+ lrh 2) (inc llh)))
    (.setLeft   node lr)
    (.setHeight node (inc (max rh lrh)))
    (.setRank   node (dec (- rnk rnkl)))
    l))

(defn ^:private lookup ^IAVLNode [^Comparator comp ^IAVLNode node k]
  (if (nil? node)
    nil
    (let [c (.compare comp k (.getKey node))]
      (cond
        (zero? c) node
        (neg? c)  (recur comp (.getLeft node)  k)
        :else     (recur comp (.getRight node) k)))))

(defn ^:private lookup-nearest
  ^IAVLNode [^Comparator comp ^IAVLNode node test k]
  (let [below? (or (identical? < test) (identical? <= test))
        equal? (or (identical? <= test) (identical? >= test))
        back?  (if below? neg? pos?)
        backward (if below?
                   #(.getLeft ^IAVLNode %)
                   #(.getRight ^IAVLNode %))
        forward  (if below?
                   #(.getRight ^IAVLNode %)
                   #(.getLeft ^IAVLNode %))]
    (loop [prev nil
           node node]
      (if (nil? node)
        prev
        (let [c (.compare comp k (.getKey node))]
          (cond
            (zero? c) (if equal?
                        node
                        (recur prev (backward node)))
            (back? c) (recur prev (backward node))
            :else     (recur node (forward node))))))))

(defn ^:private select [^IAVLNode node ^long rank]
  (if (nil? node)
    nil
    (let [node-rank (.getRank node)]
      (cond
        (== node-rank rank) node
        (<  node-rank rank) (recur (.getRight node) (dec (- rank node-rank)))
        :else               (recur (.getLeft node)  rank)))))

(defn ^:private rank ^long [^Comparator comp ^IAVLNode node k]
  (if (nil? node)
    -1
    (let [c (.compare comp k (.getKey node))]
      (cond
        (zero? c) (.getRank node)
        (neg? c)  (recur comp (.getLeft node) k)
        :else     (let [r (rank comp (.getRight node) k)]
                    (if (== -1 r)
                      -1
                      (inc (+ (.getRank node) r))))))))

(defn ^:private maybe-rebalance ^IAVLNode [^IAVLNode node]
  (let [l  (.getLeft node)
        r  (.getRight node)
        lh (height l)
        rh (height r)
        b  (- lh rh)]
    (cond
      ;; right-heavy
      (< b -1)
      (let [rl  (.getLeft r)
            rr  (.getRight r)
            rlh (height rl)
            rrh (height rr)]
        (if (== (- rlh rrh) 1)
          ;; left-heavy
          (let [new-right (rotate-right r)]
            (rotate-left (AVLNode. nil
                                   (.getKey node) (.getVal node)
                                   (.getLeft node)
                                   new-right
                                   (inc (max lh (height new-right)))
                                   (.getRank node))))
          (rotate-left node)))

      ;; left-heavy
      (> b 1)
      (let [ll  (.getLeft l)
            lr  (.getRight l)
            llh (height ll)
            lrh (height lr)]
        ;; right-heavy
        (if (== (- lrh llh) 1)
          (let [new-left (rotate-left l)]
            (rotate-right (AVLNode. nil
                                    (.getKey node) (.getVal node)
                                    new-left
                                    (.getRight node)
                                    (inc (max rh (height new-left)))
                                    (.getRank node))))
          (rotate-right node)))

      :else
      node)))

(defn ^:private maybe-rebalance! ^IAVLNode [edit ^IAVLNode node]
  (let [l  (.getLeft node)
        r  (.getRight node)
        lh (height l)
        rh (height r)
        b  (- lh rh)]
    (cond
      ;; right-heavy
      (< b -1)
      (let [node (ensure-editable edit node)
            rl   (.getLeft r)
            rr   (.getRight r)
            rlh  (height rl)
            rrh  (height rr)]
        (if (== (- rlh rrh) 1)
          ;; left-heavy
          (let [new-right (rotate-right! edit r)]
            (.setRight  node new-right)
            (.setHeight node (inc (max lh (height new-right))))
            (rotate-left! edit node))
          (rotate-left! edit node)))

      ;; left-heavy
      (> b 1)
      (let [node (ensure-editable edit node)
            ll   (.getLeft l)
            lr   (.getRight l)
            llh  (height ll)
            lrh  (height lr)]
        ;; right-heavy
        (if (== (- lrh llh) 1)
          (let [new-left (rotate-left! edit l)]
            (.setLeft   node new-left)
            (.setHeight node (inc (max rh (height new-left))))
            (rotate-right! edit node))
          (rotate-right! edit node)))

      :else
      node)))

(defn ^:private insert
  ^IAVLNode [^Comparator comp ^IAVLNode node k v ^Box found?]
  (if (nil? node)
    (AVLNode. nil k v nil nil 1 0)
    (let [nk (.getKey node)
          c  (.compare comp k nk)]
      (cond
        (zero? c)
        (do
          (set! (.-val found?) true)
          (AVLNode. nil
                    k v
                    (.getLeft   node)
                    (.getRight  node)
                    (.getHeight node)
                    (.getRank   node)))

        (neg? c)
        (let [new-child (insert comp (.getLeft node) k v found?)]
          (maybe-rebalance
           (AVLNode. nil
                     nk (.getVal node)
                     new-child
                     (.getRight node)
                     (inc (max (.getHeight new-child)
                               (height (.getRight node))))
                     (if (.-val found?)
                       (.getRank node)
                       (unchecked-inc-int (.getRank node))))))

        :else
        (let [new-child (insert comp (.getRight node) k v found?)]
          (maybe-rebalance
           (AVLNode. nil
                     nk (.getVal node)
                     (.getLeft node)
                     new-child
                     (inc (max (.getHeight new-child)
                               (height (.getLeft node))))
                     (.getRank node))))))))

(defn ^:private insert!
  ^IAVLNode [edit ^Comparator comp ^IAVLNode node k v ^Box found?]
  (if (nil? node)
    (AVLNode. edit k v nil nil 1 0)
    (let [node (ensure-editable edit node)
          nk   (.getKey node)
          c    (.compare comp k nk)]
      (cond
        (zero? c)
        (do
          (set! (.-val found?) true)
          (.setKey node k)
          (.setVal node v)
          node)

        (neg? c)
        (let [new-child (insert! edit comp (.getLeft node) k v found?)]
          (.setLeft node new-child)
          (.setHeight node
                      (inc (max (.getHeight new-child)
                                (height (.getRight node)))))
          (if-not (.-val found?)
            (.setRank node (unchecked-inc-int (.getRank node))))
          (maybe-rebalance! edit node))

        :else
        (let [new-child (insert! edit comp (.getRight node) k v found?)]
          (.setRight node new-child)
          (.setHeight node
                      (inc (max (.getHeight new-child)
                                (height (.getLeft node)))))
          (maybe-rebalance! edit node))))))

(defn ^:private get-rightmost ^IAVLNode [^IAVLNode node]
  (if-let [r (.getRight node)]
    (recur r)
    node))

(defn ^:private delete-rightmost ^IAVLNode [^IAVLNode node]
  (if-let [r (.getRight node)]
    (let [l         (.getLeft node)
          new-right (delete-rightmost r)]
      (AVLNode. nil
                (.getKey node) (.getVal node)
                l
                new-right
                (inc (max (height l) (height new-right)))
                (.getRank node)))
    (.getLeft node)))

(defn ^:private delete-rightmost! ^IAVLNode [edit ^IAVLNode node]
  (if-not (nil? node)
    (let [node (ensure-editable edit node)
          r    ^IAVLNode (.getRight node)]
      (cond
        (nil? r)
        (if-let [l (.getLeft node)]
          (ensure-editable edit l))

        (nil? (.getRight r))
        (do
          (.setRight node (.getLeft r))
          (.setHeight node
                      (inc (max (height (.getLeft node))
                                (height (.getLeft r)))))
          node)

        :else
        (let [new-right (delete-rightmost! edit r)]
          (.setRight node new-right)
          (.setHeight node
                      (inc (max (height (.getLeft node))
                                (height new-right))))
          node)))))

(defn ^:private delete
  ^IAVLNode [^Comparator comp ^IAVLNode node k ^Box found?]
  (if (nil? node)
    nil
    (let [nk (.getKey node)
          c  (.compare comp k nk)]
      (cond
        (zero? c)
        (let [l (.getLeft node)
              r (.getRight node)]
          (set! (.-val found?) true)
          (if (and l r)
            (let [p  (get-rightmost l)
                  l' (delete-rightmost l)]
              (AVLNode. nil
                        (.getKey p) (.getVal p)
                        l'
                        r
                        (inc (max (height l') (height r)))
                        (unchecked-dec-int (.getRank node))))
            (or l r)))

        (neg? c)
        (let [new-child (delete comp (.getLeft node) k found?)]
          (if (identical? new-child (.getLeft node))
            node
            (maybe-rebalance
             (AVLNode. nil
                       nk (.getVal node)
                       new-child
                       (.getRight node)
                       (inc (max (height new-child)
                                 (height (.getRight node))))
                       (if (.-val found?)
                         (unchecked-dec-int (.getRank node))
                         (.getRank node))))))

        :else
        (let [new-child (delete comp (.getRight node) k found?)]
          (if (identical? new-child (.getRight node))
            node
            (maybe-rebalance
             (AVLNode. nil
                       nk (.getVal node)
                       (.getLeft node)
                       new-child
                       (inc (max (height new-child)
                                 (height (.getLeft node))))
                       (.getRank node)))))))))

(defn ^:private delete!
  ^IAVLNode [edit ^Comparator comp ^IAVLNode node k ^Box found?]
  (if (nil? node)
    nil
    (let [nk   (.getKey node)
          c    (.compare comp k nk)]
      (cond
        (zero? c)
        (let [l (.getLeft node)
              r (.getRight node)]
          (set! (.-val found?) true)
          (cond
            (and l r)
            (let [node (ensure-editable edit node)
                  p    (get-rightmost l)
                  l'   (delete-rightmost! edit l)]
              (.setKey    node (.getKey p))
              (.setVal    node (.getVal p))
              (.setLeft   node l')
              (.setHeight node (inc (max (height l') (height r))))
              (.setRank   node (unchecked-dec-int (.getRank node)))
              node)

            l l
            r r
            :else nil))

        (neg? c)
        (let [new-child (delete! edit comp (.getLeft node) k found?)]
          (if (identical? new-child (.getLeft node))
            node
            (let [node (ensure-editable edit node)]
              (.setLeft node new-child)
              (.setHeight node
                          (inc (max (height new-child)
                                    (height (.getRight node)))))
              (if (.-val found?)
                (.setRank node (unchecked-dec-int (.getRank node))))
              (maybe-rebalance! edit node))))

        :else
        (let [new-child (delete! edit comp (.getRight node) k found?)]
          (if (identical? new-child (.getRight node))
            node
            (let [node (ensure-editable edit node)]
              (.setRight node new-child)
              (.setHeight node
                          (inc (max (height new-child)
                                    (height (.getLeft node)))))
              (maybe-rebalance! edit node))))))))

(defn ^:private join
  [^Comparator comp ^long left-count ^IAVLNode left ^IAVLNode right]
  (cond
    (nil? left)  right
    (nil? right) left
    :else
    (let [lh (.getHeight left)
          rh (.getHeight right)]
      (cond
        (== lh rh)
        (let [left-min (get-rightmost left)
              new-left (delete comp left (.getKey left-min) (Box. false))]
          (AVLNode. nil
                    (.getKey left-min) (.getVal left-min)
                    new-left
                    right
                    (unchecked-inc-int rh)
                    (unchecked-dec-int left-count)))

        (< lh rh)
        (letfn [(step [^IAVLNode current ^long lvl]
                  (cond
                    (zero? lvl)
                    (join comp left-count left current)

                    (nil? (.getLeft current))
                    (AVLNode. nil
                              (.getKey current) (.getVal current)
                              left
                              (.getRight current)
                              2
                              left-count)

                    :else
                    (let [new-child (step (.getLeft current) (dec lvl))
                          current-r (.getRight current)]
                      (maybe-rebalance
                       (AVLNode. nil
                                 (.getKey current) (.getVal current)
                                 new-child
                                 current-r
                                 (inc (max (.getHeight ^IAVLNode new-child)
                                           (height current-r)
                                           #_
                                           (if current-r
                                             (.getHeight current-r)
                                             0)))
                                 (+ left-count (.getRank current)))))))]
          (step right (- rh lh)))

        :else
        (letfn [(step [^IAVLNode current ^long cnt ^long lvl]
                  (cond
                    (zero? lvl)
                    (join comp cnt current right)

                    (nil? (.getRight current))
                    (AVLNode. nil
                              (.getKey current) (.getVal current)
                              (.getLeft current)
                              right
                              2
                              (.getRank current))

                    :else
                    (let [new-child (step (.getRight current)
                                          (dec (- cnt (.getRank current)))
                                          (dec lvl))
                          current-l (.getLeft current)]
                      (maybe-rebalance
                       (AVLNode. nil
                                 (.getKey current) (.getVal current)
                                 current-l
                                 new-child
                                 (inc (max (.getHeight ^IAVLNode new-child)
                                           (height current-l)
                                           #_
                                           (if current-l
                                             (.getHeight current-l)
                                             0)))
                                 (.getRank current))))))]
          (step left left-count (- lh rh)))))))

(defn ^:private split [^Comparator comp ^IAVLNode node k]
  (letfn [(step [^IAVLNode node]
            (if (nil? node)
              [nil nil nil]
              (let [c (.compare comp k (.getKey node))]
                (cond
                  (zero? c)
                  [(.getLeft node)
                   (MapEntry. (.getKey node) (.getVal node))
                   (.getRight node)]

                  (neg? c)
                  (let [[l e r] (step (.getLeft node))
                        r'      (insert comp
                                        (.getRight node)
                                        (.getKey node)
                                        (.getVal node)
                                        (Box. false))]
                    [l
                     e
                     (cond
                       e (join comp
                               (- (.getRank node)
                                  (inc (rank comp
                                             (.getLeft node)
                                             (.key ^MapEntry e))))
                               r
                               r')

                       r (join comp
                               (- (.getRank node)
                                  (inc (rank comp
                                             (.getLeft node)
                                             (.getKey (get-rightmost r)))))
                               r
                               r')
                       :else (join comp 0 r r'))
                     #_
                     (join comp
                           (- (.getRank node)
                              (cond
                                e
                                (inc (rank comp
                                           (.getLeft node)
                                           (.key ^MapEntry e)))
                                r
                                (inc (rank comp
                                           (.getLeft node)
                                           (.getKey (get-rightmost r))))
                                :else
                                (.getRank node)))
                           r
                           (insert comp
                                   (.getRight node)
                                   (.getKey node)
                                   (.getVal node)
                                   (Box. false)))])

                  :else
                  (let [[l e r] (step (.getRight node))]
                    [(join comp
                           (unchecked-inc-int (.getRank node))
                           (insert comp
                                   (.getLeft node)
                                   (.getKey node)
                                   (.getVal node)
                                   (Box. false))
                           l)
                     e
                     r])))))]
    (step node)))

(defn ^:private range ^IAVLNode [^Comparator comp ^IAVLNode node low high]
  (let [[_ ^MapEntry low-e  r] (split comp node low)
        [l ^MapEntry high-e _] (split comp r high)]
    (cond-> l
      low-e  (as-> node
                   (insert comp node
                           (.key low-e) (.val low-e)
                           (Box. false)))
      high-e (as-> node
                   (insert comp node
                           (.key high-e) (.val high-e)
                           (Box. false))))))

(defn ^:private seq-push [^IAVLNode node stack ascending?]
  (loop [node node stack stack]
    (if (nil? node)
      stack
      (recur (if ascending? (.getLeft node) (.getRight node))
             (conj stack node)))))

(defn ^:private avl-map-kv-reduce [^IAVLNode node f init]
  (let [init (if (nil? (.getLeft node))
               init
               (avl-map-kv-reduce (.getLeft node) f init))]
    (if (reduced? init)
      init
      (let [init (f init (.getKey node) (.getVal node))]
        (if (reduced? init)
          init
          (if (nil? (.getRight node))
            init
            (recur (.getRight node) f init)))))))

(deftype AVLMapSeq [^IPersistentMap _meta
                    ^IPersistentStack stack
                    ^boolean ascending?
                    ^int cnt
                    ^:unsynchronized-mutable ^int _hash
                    ^:unsynchronized-mutable ^int _hasheq]
  :no-print true

  Object
  (toString [this]
    (RT/printString this))

  (hashCode [this]
    (caching-hash this hash-seq _hash))

  clojure.lang.IHashEq
  (hasheq [this]
    (caching-hash this hasheq-seq _hasheq))

  clojure.lang.Seqable
  (seq [this]
    this)

  clojure.lang.Sequential
  clojure.lang.ISeq
  (first [this]
    (peek stack)
    #_
    (let [node ^IAVLNode (peek stack)]
      (MapEntry. (.getKey node) (.getVal node))))

  (more [this]
    (let [node ^IAVLNode (first stack)
          next-stack (seq-push (if ascending? (.getRight node) (.getLeft node))
                               (next stack)
                               ascending?)]
      (if (nil? next-stack)
        ()
        (AVLMapSeq. nil next-stack ascending? (unchecked-dec-int cnt) -1 -1))))

  (next [this]
    (.seq (.more this)))

  clojure.lang.Counted
  (count [this]
    (if (neg? cnt)
      (unchecked-inc-int (count (next this)))
      cnt))

  clojure.lang.IPersistentCollection
  (cons [this x]
    (cons x this))

  (equiv [this that]
    (equiv-sequential this that))

  (empty [this]
    (with-meta () _meta))

  clojure.lang.IMeta
  (meta [this]
    _meta)

  clojure.lang.IObj
  (withMeta [this meta]
    (AVLMapSeq. meta stack ascending? cnt _hash _hasheq))

  java.io.Serializable

  java.util.List
  (toArray [this]
    (RT/seqToArray (seq this)))

  (toArray [this arr]
    (RT/seqToPassedArray (seq this) arr))

  (containsAll [this c]
    (every? #(.contains this %) (iterator-seq (.iterator c))))

  (size [this]
    (count this))

  (isEmpty [this]
    (zero? cnt))

  (contains [this x]
    (or (some #(Util/equiv % x) this) false))

  (iterator [this]
    (SeqIterator. this))

  (subList [this from to]
    (.subList (Collections/unmodifiableList (ArrayList. this)) from to))

  (indexOf [this x]
    (loop [i (int 0) s (seq this)]
      (if s
        (if (Util/equiv (first s) x)
          i
          (recur (unchecked-inc-int i) (next s)))
        (int -1))))

  (lastIndexOf [this x]
    (.lastIndexOf (ArrayList. this) x))

  (listIterator [this]
    (.listIterator (Collections/unmodifiableList (ArrayList. this))))

  (listIterator [this i]
    (.listIterator (Collections/unmodifiableList (ArrayList. this)) i))

  (get [this i]
    (RT/nth this i))

  (add             [this x]      (throw-unsupported))
  (^boolean remove [this x]      (throw-unsupported))
  (addAll          [this c]      (throw-unsupported))
  (clear           [this]        (throw-unsupported))
  (retainAll       [this c]      (throw-unsupported))
  (removeAll       [this c]      (throw-unsupported))
  (set             [this i e]    (throw-unsupported))
  (remove          [this ^int i] (throw-unsupported))
  (add             [this i e]    (throw-unsupported)))

(defn ^:private create-seq [node ascending? cnt]
  (AVLMapSeq. nil (seq-push node nil ascending?) ascending? cnt -1 -1))

(declare ->AVLTransientMap)

(deftype AVLMap [^Comparator comp
                 ^IAVLNode tree
                 ^int cnt
                 ^IPersistentMap _meta
                 ^:unsynchronized-mutable ^int _hash
                 ^:unsynchronized-mutable ^int _hasheq]
  Object
  (toString [this]
    (RT/printString this))

  (hashCode [this]
    (caching-hash this hash-imap _hash))

  (equals [this that]
    (APersistentMap/mapEquals this that))

  IAVLTree
  (getTree [this]
    tree)

  INavigableTree
  (nearest [this test k]
    (if-let [node (lookup-nearest comp tree test k)]
      (MapEntry. (.getKey node) (.getVal node))))

  clojure.lang.IHashEq
  (hasheq [this]
    (caching-hash this hasheq-imap _hasheq))

  clojure.lang.IMeta
  (meta [this]
    _meta)

  clojure.lang.IObj
  (withMeta [this meta]
    (AVLMap. comp tree cnt meta _hash _hasheq))

  clojure.lang.Counted
  (count [this]
    cnt)

  clojure.lang.Indexed
  (nth [this i]
    (if-let [n (select tree i)]
      (MapEntry. (.getKey ^IAVLNode n) (.getVal ^IAVLNode n))
      (throw
       (IndexOutOfBoundsException. "nth index out of bounds in AVL tree"))))

  (nth [this i not-found]
    (if-let [n (select tree i)]
      (MapEntry. (.getKey ^IAVLNode n) (.getVal ^IAVLNode n))
      not-found))

  clojure.lang.IPersistentCollection
  (cons [this entry]
    (if (vector? entry)
      (assoc this (nth entry 0) (nth entry 1))
      (reduce conj this entry)))

  (empty [this]
    (AVLMap. comp nil 0 _meta empty-map-hashcode empty-map-hasheq))

  (equiv [this that]
    (equiv-map this that))

  clojure.lang.IFn
  (invoke [this k]
    (.valAt this k))

  (invoke [this k not-found]
    (.valAt this k not-found))

  (applyTo [this args]
    (let [n (RT/boundedLength args 2)]
      (case n
        0 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName))))
        1 (.invoke this (first args))
        2 (.invoke this (first args) (second args))
        3 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName)))))))

  clojure.lang.Seqable
  (seq [this]
    (if (pos? cnt)
      (create-seq tree true cnt)))

  clojure.lang.Reversible
  (rseq [this]
    (if (pos? cnt)
      (create-seq tree false cnt)))

  clojure.lang.ILookup
  (valAt [this k]
    (.valAt this k nil))

  (valAt [this k not-found]
    (let [n ^IAVLNode (lookup comp tree k)]
      (if-not (nil? n)
        (.getVal n)
        not-found)))

  clojure.lang.Associative
  (assoc [this k v]
    (let [found?   (Box. false)
          new-tree (insert comp tree k v found?)]
      (AVLMap. comp
               new-tree
               (if (.-val found?) cnt (unchecked-inc-int cnt))
               _meta -1 -1)))

  (containsKey [this k]
    (not (nil? (.entryAt this k))))

  (entryAt [this k]
    (if-let [node (lookup comp tree k)]
      (MapEntry. (.getKey node) (.getVal node))))

  clojure.lang.MapEquivalence
  clojure.lang.IPersistentMap
  (without [this k]
    (let [found?   (Box. false)
          new-tree (delete comp tree k found?)]
      (if (.-val found?)
        (AVLMap. comp
                 new-tree
                 (unchecked-dec-int cnt)
                 _meta -1 -1)
        this)))

  (assocEx [this k v]
    (let [found?   (Box. false)
          new-tree (insert comp tree k v found?)]
      (if (.-val found?)
        (throw (ex-info "key already present" {}))
        (AVLMap. comp
                 new-tree
                 (unchecked-inc-int cnt)
                 _meta -1 -1))))

  clojure.lang.Sorted
  (seq [this ascending?]
    (if (pos? cnt)
      (create-seq tree ascending? cnt)))

  (seqFrom [this k ascending?]
    (if (pos? cnt)
      (loop [stack nil t tree]
        (if-not (nil? t)
          (let [c (.compare comp k (.getKey t))]
            (cond
              (zero? c)  (AVLMapSeq. nil (conj stack t) ascending? -1 -1 -1)
              ascending? (if (neg? c)
                           (recur (conj stack t) (.getLeft t))
                           (recur stack          (.getRight t)))
              :else      (if (pos? c)
                           (recur (conj stack t) (.getRight t))
                           (recur stack          (.getLeft t)))))
          (if-not (nil? stack)
            (AVLMapSeq. nil stack ascending? -1 -1 -1))))))

  (entryKey [this entry]
    (key entry))

  (comparator [this]
    comp)

  clojure.lang.IEditableCollection
  (asTransient [this]
    (->AVLTransientMap
     (AtomicReference. (Thread/currentThread)) comp tree cnt))

  clojure.core.protocols/IKVReduce
  (kv-reduce [this f init]
    (if (nil? tree)
      init
      (let [init (avl-map-kv-reduce tree f init)]
        (if (reduced? init)
          @init
          init))))

  java.io.Serializable

  Iterable
  (iterator [this]
    (SeqIterator. (seq this)))

  java.util.Map
  (get [this k]
    (.valAt this k))

  (clear [this]
    (throw-unsupported))

  (containsValue [this v]
    (.. this values (contains v)))

  (entrySet [this]
    (set (seq this)))

  (put [this k v]
    (throw-unsupported))

  (putAll [this m]
    (throw-unsupported))

  (remove [this k]
    (throw-unsupported))

  (size [this]
    cnt)

  (values [this]
    (vals this)))

(deftype AVLTransientMap [^AtomicReference edit
                          ^Comparator comp
                          ^:unsynchronized-mutable ^IAVLNode tree
                          ^:unsynchronized-mutable ^int cnt]
  clojure.lang.Counted
  (count [this]
    cnt)

  clojure.lang.ILookup
  (valAt [this k]
    (.valAt this k nil))

  (valAt [this k not-found]
    (let [n ^IAVLNode (lookup comp tree k)]
      (if-not (nil? n)
        (.getVal n)
        not-found)))

  clojure.lang.IFn
  (invoke [this k]
    (.valAt this k))

  (invoke [this k not-found]
    (.valAt this k not-found))

  (applyTo [this args]
    (let [n (RT/boundedLength args 2)]
      (case n
        0 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName))))
        1 (.invoke this (first args))
        2 (.invoke this (first args) (second args))
        3 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName)))))))

  clojure.lang.ITransientCollection
  (conj [this entry]
    (ensure-editable edit)
    (if (vector? entry)
      (assoc! this (nth entry 0) (nth entry 1))
      (reduce conj! this entry)))

  (persistent [this]
    (ensure-editable edit)
    (.set edit nil)
    (AVLMap. comp tree cnt nil -1 -1))

  clojure.lang.ITransientAssociative
  (assoc [this k v]
    (ensure-editable edit)
    (let [found?   (Box. false)
          new-tree (insert! edit comp tree k v found?)]
      (set! tree new-tree)
      (if-not (.-val found?)
        (set! cnt (unchecked-inc-int cnt)))
      this))

  clojure.lang.ITransientMap
  (without [this k]
    (ensure-editable edit)
    (let [found?   (Box. false)
          new-tree (delete! edit comp tree k found?)]
      (when (.-val found?)
        (set! tree new-tree)
        (set! cnt  (unchecked-dec-int cnt)))
      this)))

(declare ->AVLTransientSet)

(deftype AVLSet [^IPersistentMap _meta
                 ^AVLMap avl-map
                 ^:unsynchronized-mutable ^int _hash
                 ^:unsynchronized-mutable ^int _hasheq]
  Object
  (toString [this]
    (RT/printString this))

  (hashCode [this]
    (caching-hash this hash-iset _hash))

  (equals [this that]
    (APersistentSet/setEquals this that))

  IAVLTree
  (getTree [this]
    (.getTree avl-map))

  INavigableTree
  (nearest [this test k]
    (if-let [node (lookup-nearest (.comparator avl-map)
                                  (.getTree avl-map)
                                  test
                                  k)]
      (.getKey node)))

  clojure.lang.IHashEq
  (hasheq [this]
    (caching-hash this hasheq-iset _hasheq))

  clojure.lang.IMeta
  (meta [this]
    _meta)

  clojure.lang.IObj
  (withMeta [this meta]
    (AVLSet. meta avl-map _hash _hasheq))

  clojure.lang.Counted
  (count [this]
    (count avl-map))

  clojure.lang.Indexed
  (nth [this i]
    (if-let [n (select (.-tree avl-map) i)]
      (.getVal ^IAVLNode n)
      (throw
       (IndexOutOfBoundsException. "nth index out of bounds in AVL tree"))))

  (nth [this i not-found]
    (if-let [n (select (.-tree avl-map) i)]
      (.getVal ^IAVLNode n)
      not-found))

  clojure.lang.IPersistentCollection
  (cons [this x]
    (AVLSet. _meta (assoc avl-map x x) -1 -1))

  (empty [this]
    (AVLSet. _meta (empty avl-map) empty-set-hashcode empty-set-hasheq))

  (equiv [this that]
    (and
     (set? that)
     (== (count this) (count that))
     (every? #(contains? this %) that)))

  clojure.lang.Seqable
  (seq [this]
    (keys avl-map))

  clojure.lang.Sorted
  (seq [this ascending?]
     (RT/keys (.seq avl-map ascending?)))

  (seqFrom [this k ascending?]
    (RT/keys (.seqFrom avl-map k ascending?)))

  (entryKey [this entry]
    entry)

  (comparator [this]
    (.comparator avl-map))

  clojure.lang.Reversible
  (rseq [this]
    (map key (rseq avl-map)))

  clojure.lang.ILookup
  (valAt [this v]
    (.valAt this v nil))

  (valAt [this v not-found]
    (let [n (.entryAt avl-map v)]
      (if-not (nil? n)
        (.getKey n)
        not-found)))

  clojure.lang.IPersistentSet
  (disjoin [this v]
    (AVLSet. _meta (dissoc avl-map v) -1 -1))

  (contains [this k]
    (contains? avl-map k))

  (get [this k]
    (.valAt this k nil))

  clojure.lang.IFn
  (invoke [this k]
    (.valAt this k))

  (applyTo [this args]
    (let [n (RT/boundedLength args 1)]
      (case n
        0 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName))))
        1 (.invoke this (first args))
        2 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName)))))))

  clojure.lang.IEditableCollection
  (asTransient [this]
    (->AVLTransientSet (.asTransient avl-map)))

  java.io.Serializable

  java.util.Set
  (add       [this o] (throw-unsupported))
  (remove    [this o] (throw-unsupported))
  (addAll    [this c] (throw-unsupported))
  (clear     [this]   (throw-unsupported))
  (retainAll [this c] (throw-unsupported))
  (removeAll [this c] (throw-unsupported))

  (containsAll [this c]
    (every? #(.contains this %) (iterator-seq (.iterator c))))

  (size [this]
    (count this))

  (isEmpty [this]
    (zero? (count this)))

  (iterator [this]
    (SeqIterator. (seq this)))

  (toArray [this]
    (RT/seqToArray (seq this)))

  (toArray [this a]
    (RT/seqToPassedArray (seq this) a)))

(deftype AVLTransientSet
    [^:unsynchronized-mutable ^AVLTransientMap transient-avl-map]
  clojure.lang.ITransientCollection
  (conj [this k]
    (set! transient-avl-map (.assoc transient-avl-map k k))
    this)

  (persistent [this]
    (AVLSet. nil (.persistent transient-avl-map) -1 -1))

  clojure.lang.ITransientSet
  (disjoin [this k]
    (set! transient-avl-map (.without transient-avl-map k))
    this)

  (contains [this k]
    (not (identical? this (.valAt transient-avl-map k this))))

  (get [this k]
    (.valAt transient-avl-map k))

  clojure.lang.IFn
  (invoke [this k]
    (.valAt transient-avl-map k))

  (invoke [this k not-found]
    (.valAt transient-avl-map k not-found))

  (applyTo [this args]
    (let [n (RT/boundedLength args 2)]
      (case n
        0 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName))))
        1 (.invoke this (first args))
        2 (.invoke this (first args) (second args))
        3 (throw (clojure.lang.ArityException.
                  n (.. this (getClass) (getSimpleName)))))))

  clojure.lang.Counted
  (count [this]
    (.count transient-avl-map)))

(def ^:private empty-map
  (AVLMap. RT/DEFAULT_COMPARATOR nil 0 nil
           empty-map-hashcode empty-map-hasheq))

(def ^:private empty-set
  (AVLSet. nil empty-map empty-set-hashcode empty-set-hasheq))

(doseq [v [#'->AVLMapSeq
           #'->AVLNode
           #'->AVLMap
           #'->AVLSet
           #'->AVLTransientMap
           #'->AVLTransientSet]]
  (alter-meta! v assoc :private true))

(defn sorted-map
  "keyval => key val
  Returns a new AVL map with supplied mappings."
  {:added "0.0.1"}
  [& keyvals]
  (loop [in (seq keyvals) out (transient empty-map)]
    (if in
      (if-let [nin (next in)]
        (recur (next nin) (assoc! out (first in) (first nin)))
        (throw (IllegalArgumentException.
                 (format
                   "sorted-map: no value supplied for key: %s"
                   (first in)))))
      (persistent! out))))

(defn sorted-map-by
  "keyval => key val
  Returns a new sorted map with supplied mappings, using the supplied
  comparator."
  {:added "0.0.1"}
  [^Comparator comparator & keyvals]
  (loop [in  (seq keyvals)
         out (AVLTransientMap.
              (AtomicReference. (Thread/currentThread)) comparator nil 0)]
    (if in
      (if-let [nin (next in)]
        (recur (next nin) (assoc! out (first in) (first nin)))
        (throw (IllegalArgumentException.
                 (format
                   "sorted-map-by: no value supplied for key: %s"
                   (first in)))))
      (persistent! out))))

(defn sorted-set
  "Returns a new sorted set with supplied keys."
  {:added "0.0.1"}
  [& keys]
  (persistent! (reduce conj! (transient empty-set) keys)))

(defn sorted-set-by
  "Returns a new sorted set with supplied keys, using the supplied comparator."
  {:added "0.0.1"}
  [^Comparator comparator & keys]
  (persistent!
   (reduce conj!
           (AVLTransientSet. (transient (sorted-map-by comparator)))
           keys)))

(defn rank-of
  "Returns the rank of x in coll or -1 if not present."
  {:added "0.0.6"}
  ^long [coll x]
  (rank (.comparator ^clojure.lang.Sorted coll) (.getTree ^IAVLTree coll) x))

(defn nearest
  "(alpha)

  Equivalent to, but more efficient than, (first (subseq* coll test x)),
  where subseq* is clojure.core/subseq for test in #{>, >=} and
  clojure.core/rsubseq for test in #{<, <=}."
  {:added "0.0.12"}
  [coll test x]
  (.nearest ^INavigableTree coll test x))

(defn split-key
  "(alpha)

  Returns [left e? right], where left and right are collections of
  the same type as coll and containing, respectively, the keys below
  and above k in the ordering determined by coll's comparator, while
  e? is the entry at key k for maps, the stored copy of the key k for
  sets, nil if coll does not contain k."
  {:added "0.0.12"}
  [k coll]
  (let [comp (.comparator ^clojure.lang.Sorted coll)
        [left e? right] (split comp (.getTree ^IAVLTree coll) k)
        keyfn (if (map? coll) key identity)
        wrap (if (map? coll)
               (fn wrap-map [tree cnt]
                 (AVLMap. comp tree cnt nil -1 -1))
               (fn wrap-set [tree cnt]
                 (AVLSet. nil (AVLMap. comp tree cnt nil -1 -1) -1 -1)))]
    [(wrap left
           (if (or e? right)
             (rank-of coll (keyfn (nearest coll >= k)))
             (count coll)))
     (if (and e? (set? coll))
       (.getKey ^MapEntry e?)
       e?)
     (wrap right
           (if right
             (- (count coll) (rank-of coll (keyfn (nearest coll > k))))
             0))]))

(defn split-at
  "(alpha)

  Equivalent to, but more efficient than,
  [(into (empty coll) (take n coll))
   (into (empty coll) (drop n coll))]."
  {:added "0.0.12"}
  [^long n coll]
  (if (>= n (count coll))
    [coll (empty coll)]
    (let [k (nth coll n)
          k (if (map? coll) (key k) k)
          [l e r] (split-key k coll)]
      [l (conj r e)])))

(defn subrange
  "(alpha)

  Returns an AVL collection comprising the entries of coll between
  start and end (in the sense determined by coll's comparator) in
  logarithmic time. Whether the endpoints are themselves included in
  the returned collection depends on the provided tests; start-test
  must be either > or >=, end-test must be either < or <=.

  When passed a single test and limit, subrange infers the other end
  of the range from the test: > / >= mean to include items up to the
  end of coll, < / <= mean to include items taken from the beginning
  of coll.

  (subrange >= start <= end) is equivalent to, but more efficient
  than, (into (empty coll) (subseq coll >= start <= end)."
  {:added "0.0.12"}
  ([coll test limit]
     (cond
       (zero? (count coll))
       coll

       (#{> >=} test)
       (let [n (select (.getTree ^IAVLTree coll)
                       (dec (count coll)))]
         (subrange coll
                   test limit
                   <= (.getKey ^IAVLNode n)))

       :else
       (let [n (select (.getTree ^IAVLTree coll) 0)]
         (subrange coll
                   >= (.getKey ^IAVLNode n)
                   test limit))))
  ([coll start-test start end-test end]
     (if (zero? (count coll))
       coll
       (let [comp (.comparator ^clojure.lang.Sorted coll)]
         (if (pos? (.compare comp start end))
           (throw
            (IndexOutOfBoundsException. "start greater than end in subrange"))
           (let [keyfn (if (map? coll) key identity)
                 l (nearest coll start-test start)
                 h (nearest coll end-test end)]
             (if (and l h)
               (let [tree (range comp (.getTree ^IAVLTree coll)
                                 (keyfn l)
                                 (keyfn h))
                     cnt  (inc (- (rank-of coll (keyfn h))
                                  (rank-of coll (keyfn l))))
                     m    (AVLMap. comp tree cnt nil -1 -1)]
                 (if (map? coll)
                   m
                   (AVLSet. nil m -1 -1)))
               (empty coll))))))))
