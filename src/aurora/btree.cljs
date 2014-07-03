(ns aurora.btree
  (:require [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true]
            [cemerick.pprng :as pprng]
            clojure.set)
  (:require-macros [aurora.macros :refer [debug check apush apush-into apop-from amake aclear typeof set!! dofrom perf-time for!]]))

;; COMPARISONS

;; 'bool' < 'number' < 'string' < 'undefined'
(def least false)
(def greatest js/undefined)

(defn val? [a]
  (or (string? a) (number? a)))

(defn val-compare [a b]
  (if (identical? a b)
    0
    (if (or (and (identical? (typeof a) (typeof b))
                 (< a b))
            (< (typeof a) (typeof b)))
      -1
      1)))

(defn val-lt [a b]
  (== -1 (val-compare a b)))

(defn val-lte [a b]
  (not (== 1 (val-compare a b))))

(defn least-key [key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result least))
    result))

(defn greatest-key [key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result greatest))
    result))

(defn key-compare [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            (if (or (and (identical? (typeof a) (typeof b))
                         (< a b))
                    (< (typeof a) (typeof b)))
              -1
              1)))
        0))))

(defn ^boolean prefix-not= [as bs max-len]
  (loop [i 0]
    (if (< i max-len)
      (let [a (aget as i)
            b (aget bs i)]
        (if (identical? a b)
          (recur (+ i 1))
          true))
      false)))

(defn ^boolean key= [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            false))
        true))))

(defn ^boolean key-not= [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            true))
        false))))

(defn ^boolean key-lt [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            (or (and (identical? (typeof a) (typeof b))
                         (< a b))
                    (< (typeof a) (typeof b)))))
        false))))

(defn ^boolean key-gt [as bs]
  (let [as-len (alength as)
        bs-len (alength bs)]
    (assert (== as-len bs-len) (pr-str as bs))
    (loop [i 0]
      (if (< i as-len)
        (let [a (aget as i)
              b (aget bs i)]
          (if (identical? a b)
            (recur (+ i 1))
            (or (and (identical? (typeof a) (typeof b))
                         (> a b))
                    (> (typeof a) (typeof b)))))
        false))))

(defn ^boolean key-lte [as bs]
  (not (== 1 (key-compare as bs))))

(defn ^boolean key-gte [as bs]
  (not (== -1 (key-compare as bs))))

(defn key-find-gt [keys key]
  (loop [lo 0
         hi (- (alength keys) 1)]
    (if (< hi lo)
      lo
      (let [mid (+ lo (js/Math.floor (/ (- hi lo) 2)))
            mid-key (aget keys mid)]
        (if (key-lt mid-key key)
          (recur (+ mid 1) hi)
          (if (key= mid-key key)
            (+ mid 1)
            (recur lo (- mid 1))))))))

(defn key-find-gte [keys key]
  (loop [lo 0
         hi (- (alength keys) 1)]
    (if (< hi lo)
      lo
      (let [mid (+ lo (js/Math.floor (/ (- hi lo) 2)))
            mid-key (aget keys mid)]
        (if (key-lt mid-key key)
          (recur (+ mid 1) hi)
          (if (key= mid-key key)
            mid
            (recur lo (- mid 1))))))))

(defn prim= [a b]
  (or (== a b)
      (and (array? a) (array? b)
           (== (alength a) (alength b))
           (loop [i 0]
             (if (< i (alength a))
               (if (prim= (aget a i) (aget b i))
                 (recur (+ i 1))
                 false)
               true)))))

;; TREES

(def left-child 0)
(def right-child 1)

(deftype Tree [max-keys key-len ^:mutable root]
  Object
  (clear [this]
         (set! root (Node. nil nil #js [] #js [] nil nil nil)))
  (toString [this]
            (pr-str (into (sorted-map-by key-compare) (map vec this))))
  (add [this key val]
       (.add root key val max-keys))
  (del [this key]
       (.del root key max-keys))
  (push! [this ix key&val&child which-child]
           (let [left-child (if (== which-child left-child) (aget key&val&child 2) root)
                 right-child (if (== which-child right-child) (aget key&val&child 2) root)]
             (set! root (Node. this 0 #js [(aget key&val&child 0)] #js [(aget key&val&child 1)] #js [left-child right-child] (.-lower left-child) (.-upper right-child)))
             (set! (.-parent left-child) root)
             (set! (.-parent-ix left-child) 0)
             (set! (.-parent right-child) root)
             (set! (.-parent-ix right-child) 1)))
  (maintain! [this])
  (valid! [this]
          (when (> (alength (.-keys root)) 0) ;; the empty tree does not obey most invariants
            (.valid! root max-keys))
          true)
  (pretty-print [this]
                (prn :root)
                (loop [nodes [root]]
                  (when (seq nodes)
                    (apply println (map #(.pretty-print %) nodes))
                    (recur (mapcat #(.-children %) nodes)))))
  (foreach [this f]
           (.foreach root f))
  (foreach-reverse [this f]
                   (.foreach-reverse root f))
  (keys [this]
        (let [results #js []]
          (.foreach this #(apush results %1))
          results))
  (elems [this]
       (let [results #js []]
         (.foreach this #(do (apush results %1) (apush results %2)))
         results))
  (empty? [this]
          (== 0 (alength (.-keys root))))
  ISeqable
  (-seq [this]
        (seq (map vec (partition 2 (.elems this))))))

(deftype Node [parent parent-ix keys vals children ^:mutable lower ^:mutable upper]
  Object
  (add [this key val max-keys]
       (let [ix (key-find-gte keys key)]
            (if (and (< ix (alength keys)) (key= key (aget keys ix)))
              (aget vals ix)
              (if (nil? children)
                (do
                  (.push! this ix #js [key val])
                  (.maintain! this max-keys)
                  nil)
                (.add (aget children ix) key val max-keys)))))
  (del [this key max-keys]
       (let [ix (key-find-gte keys key)]
         (if (and (< ix (alength keys)) (key= key (aget keys ix)))
           (let [val (aget vals ix)]
             (if (nil? children)
               (do
                 (.pop! this ix)
                 (.maintain! this max-keys)
                 val)
               (loop [node (aget children (+ ix 1))]
                 (if (not (nil? (.-children node)))
                   (recur (aget (.-children node) 0))
                   (do
                     (aset keys ix (aget (.-keys node) 0))
                     (aset vals ix (aget (.-vals node) 0))
                     (.pop! node 0)
                     (.maintain! node max-keys)
                     (.maintain! this max-keys)
                     val)))))
           (if (nil? children)
             nil
             (.del (aget children ix) key max-keys)))))
  (push! [this ix key&val&child which-child] ;; on leaves, child and which-child are not required
         (.splice keys ix 0 (aget key&val&child 0))
         (.splice vals ix 0 (aget key&val&child 1))
         (when-not (nil? children)
           (let [child-ix (+ ix which-child)]
             (.splice children child-ix 0 (aget key&val&child 2)))))
  (pop! [this ix which-child]
        (let [key (aget keys ix)
              val (aget vals ix)
              child nil]
          (.splice keys ix 1)
          (.splice vals ix 1)
          (if-not (nil? children)
            (let [child-ix (+ ix which-child)
                  child (aget children child-ix)]
              (.splice children child-ix 1)
              (set! (.-parent child) nil)
              #js [key val child])
            #js [key val])))
  (maintain! [this max-keys]
             (assert (not (nil? max-keys)))
             (when-not (nil? parent)
               (let [min-keys (js/Math.floor (/ max-keys 2))]
                 (when-not (nil? children)
                   (dotimes [ix (alength children)]
                     (let [child (aget children ix)]
                       (set! (.-parent-ix child) ix)
                       (set! (.-parent child) this))))
                 (if (> (alength keys) max-keys)
                   (.split! this max-keys)
                   (if (and (< (alength keys) min-keys) (instance? Node parent))
                     (.rotate-left! this max-keys)
                     (if (== (alength keys) 0)
                       (if (nil? children)
                         (do
                           (set! lower nil)
                           (set! upper nil))
                         (do
                           #_(assert (== 1 (alength children)))
                           #_(assert (instance? Tree parent))
                           (set! (.-parent (aget children 0)) parent)
                           (set! (.-root parent) (aget children 0))))
                       (do
                         (.update-lower! this (if (nil? children) (aget keys 0) (.-lower (aget children 0))))
                         (.update-upper! this (if (nil? children) (aget keys (- (alength keys) 1)) (.-upper (aget children (- (alength children) 1))))))))))))
  (update-lower! [this new-lower]
                 (when (or (nil? lower) (key-not= lower new-lower))
                   (set! lower new-lower)
                   (when (and (instance? Node parent) (== parent-ix 0))
                     (.update-lower! parent new-lower))))
  (update-upper! [this new-upper]
                 (when (or (nil? upper) (key-not= upper new-upper))
                   (set! upper new-upper)
                   (when (and (instance? Node parent) (== parent-ix (- (alength (.-children parent)) 1)))
                     (.update-upper! parent new-upper))))
  (split! [this max-keys]
          (let [median (js/Math.floor (/ (alength keys) 2))
                right-node (Node. parent (+ parent-ix 1) #js [] #js [] (when-not (nil? children) #js []) nil nil)]
            (while (> (alength keys) (+ median 1))
              (.push! right-node 0 (.pop! this (- (alength keys) 1) right-child) left-child))
            (when-not (nil? children)
              (.unshift (.-children right-node) (.pop children)))
            (.push! parent parent-ix #js [(.pop keys) (.pop vals) right-node] right-child)
            (.maintain! this max-keys)
            (.maintain! right-node max-keys)
            (.maintain! parent max-keys)
            #_(.valid! this max-keys)
            #_(.valid! right-node max-keys)))
  (rotate-left! [this max-keys]
                (if (> parent-ix 0)
                  (let [left-node (aget (.-children parent) (- parent-ix 1))
                        min-keys (js/Math.floor (/ max-keys 2))]
                    (if (> (alength (.-keys left-node)) min-keys)
                      (let [key&val&child (.pop! left-node (- (alength (.-keys left-node)) 1) right-child)
                            separator-ix (- parent-ix 1)]
                        (.push! this 0 #js [(aget (.-keys parent) separator-ix) (aget (.-vals parent) separator-ix) (aget key&val&child 2)] left-child)
                        (aset (.-keys parent) separator-ix (aget key&val&child 0))
                        (aset (.-vals parent) separator-ix (aget key&val&child 1))
                        (.maintain! this max-keys)
                        (.maintain! left-node max-keys)
                        (.maintain! parent max-keys))
                      (.rotate-right! this max-keys)))
                  (.rotate-right! this max-keys)))
  (rotate-right! [this max-keys]
                 (if (< parent-ix (- (alength (.-children parent)) 2))
                   (let [right-node (aget (.-children parent) (+ parent-ix 1))
                         min-keys (js/Math.floor (/ max-keys 2))]
                     (if (> (alength (.-keys right-node)) min-keys)
                       (let [key&val&child (.pop! right-node 0 left-child)
                             separator-ix parent-ix]
                         (.push! this (alength keys) #js [(aget (.-keys parent) separator-ix) (aget (.-vals parent) separator-ix) (aget key&val&child 2)] right-child)
                         (aset (.-keys parent) separator-ix (aget key&val&child 0))
                         (aset (.-vals parent) separator-ix (aget key&val&child 1))
                         (.maintain! this max-keys)
                         (.maintain! right-node max-keys)
                         (.maintain! parent max-keys))
                       (.merge! this max-keys)))
                   (.merge! this max-keys)))
  (merge! [this max-keys]
          (let [parent parent ;; in case it gets nulled out by .pop!
                separator-ix (if (> parent-ix 0) (- parent-ix 1) parent-ix)
                key&val&child (.pop! parent separator-ix right-child)
                left-node (aget (.-children parent) separator-ix)
                right-node (aget key&val&child 2)]
            (.push! left-node (alength (.-keys left-node))
                    #js [(aget key&val&child 0)
                         (aget key&val&child 1)
                         (when-not (nil? (.-children right-node)) (.shift (.-children right-node)))]
                    right-child)
            (while (> (alength (.-keys right-node)) 0)
              (.push! left-node (alength (.-keys left-node)) (.pop! right-node 0 left-child) right-child))
            (.maintain! left-node max-keys)
            (.maintain! right-node max-keys)
            (.maintain! parent max-keys)))
  (valid! [this max-keys]
          (let [min-keys (js/Math.floor (/ max-keys 2))]
            (when (instance? Node parent) ;; root is allowed to have less keys
              (assert (>= (count keys) min-keys) (pr-str keys min-keys)))
            (assert (<= (count keys) max-keys) (pr-str keys max-keys))
            (assert (= (count keys) (count (set keys))))
            (assert (= (seq keys) (seq (sort-by identity key-compare keys))))
            (assert (every? #(key-lte lower %) keys) (pr-str lower keys))
            (assert (every? #(key-gte upper %) keys) (pr-str upper keys))
            (if (= 0 (count children))
              (do
                (assert (= (count keys) (count vals)) (pr-str keys vals))
                (assert (= lower (aget keys 0)) (pr-str lower keys))
                (assert (= upper (aget keys (- (alength keys) 1))) (pr-str upper keys)))
              (do
                (assert (> (count keys) 0))
                (dotimes [ix (count children)]
                  (assert (= ix (.-parent-ix (aget children ix)))))
                (assert (= (count keys) (count vals) (dec (count children))) (pr-str keys vals children))
                (assert (= lower (.-lower (aget children 0))) (pr-str lower (.-lower (aget children 0))))
                (assert (= upper (.-upper (aget children (- (alength children) 1)))) (pr-str upper (.-upper (aget children (- (alength children) 1)))))
                (assert (every? #(key-gt (aget keys %) (.-upper (aget children %))) (range (count keys))))
                (assert (every? #(key-lt (aget keys %) (.-lower (aget children (inc %)))) (range (count keys))))
                (dotimes [i (count children)] (.valid! (aget children i) max-keys))))))
  (pretty-print [this]
                (str "(" parent-ix ")" "|" (pr-str lower) " " (pr-str (vec keys)) " " (pr-str upper) "|"))
  (foreach [this f]
           (dotimes [i (alength keys)]
             (when (not (nil? children))
               (.foreach (aget children i) f))
             (f (aget keys i) (aget vals i)))
           (when (not (nil? children))
             (.foreach (aget children (alength keys)) f)))
  (foreach-reverse [this f]
           (when (not (nil? children))
             (.foreach (aget children (alength keys)) f))
           (dotimes [i (alength keys)]
             (let [j (- (alength keys) i 1)]
               (when (not (nil? children))
                 (.foreach (aget children j) f))
               (f (aget keys j) (aget vals j))))))

(defn tree [min-keys key-len]
  (let [node (Node. nil nil #js [] #js [] nil nil nil)
        tree (Tree. (* 2 min-keys) key-len node)]
    (set! (.-parent node) tree)
    (set! (.-parent-ix node) 0)
    tree))

;; ITERATORS
;; on seek-gt, return first key greater than seek-key, or nil if there is no such key
;; on seek-gte, return first key greater than or equal to seek-key, or nil if there is no such key
;; NOTE iterators are not write-safe unless reset after writing

(deftype Iterator [tree ^:mutable node ^:mutable ix]
  Object
  (reset [this key]
         (set! node (.-root tree))
         (set! ix 0))
  (seek-gt [this key]
           (loop []
             (if (and (instance? Node (.-parent node))
                      (or (key-lte (.-upper node) key)
                          (key-lt key (.-lower node))))
               (do
                 (set! ix 0)
                 (set! node (.-parent node))
                 (recur))
               (loop []
                 (set! ix (key-find-gt (.-keys node) key))
                 (if (nil? (.-children node))
                   (if (< ix (alength (.-keys node)))
                     (aget (.-keys node) ix)
                     nil)
                   (if (key-lte (.-upper (aget (.-children node) ix)) key)
                     (aget (.-keys node) ix)
                     (do
                       (set! node (aget (.-children node) ix))
                       (set! ix 0)
                       (recur))))))))
  (seek-gte [this key]
            (loop []
              (if (and (instance? Node (.-parent node))
                       (or (key-lt (.-upper node) key)
                           (key-lt key (.-lower node))))
                (do
                  (set! ix 0)
                  (set! node (.-parent node))
                  (recur))
                (loop []
                  (set! ix (key-find-gte (.-keys node) key))
                  (if (nil? (.-children node))
                    (if (< ix (alength (.-keys node)))
                      (aget (.-keys node) ix)
                      nil)
                    (if (key-lt (.-upper (aget (.-children node) ix)) key)
                      (aget (.-keys node) ix)
                      (do
                        (set! node (aget (.-children node) ix))
                        (set! ix 0)
                        (recur))))))))
  (contains? [this key]
             (let [found-key (.seek-gte this key)]
               (and (not (nil? found-key))
                    (key= found-key key)))))

(defn iterator [tree]
  (Iterator. tree (.-root tree) 0))

;; CONSTRAINTS

;; los and his are inclusive

;; propagate updates the current lo/hi for each var and may set the solver to failed
;; split-left either:
;;   breaks the solutions into two branches, sets the left branch, returns true
;;   has only one possible solution, does nothing, returns false
;; split-right:
;;   breaks the solutions into two branches, sets the right branch

(deftype Contains [iterator vars scratch-key]
  Object
  (reset [this solver constraint]
         (.reset iterator))
  (propagate [this solver constraint]
             (let [los (.-los solver)
                   his (.-his solver)]
               ;; derive a lower bound for the iterator
               (loop [i 0]
                 (when (< i (alength vars))
                   (let [var (aget vars i)]
                     (aset scratch-key i (aget los var))
                     (if (identical? (aget los var) (aget his var))
                       (recur (+ i 1))
                       (loop [i (+ i 1)]
                         (when (< i (alength vars))
                           (aset scratch-key i least)
                           (recur (+ i 1))))))))
               ;; find a new lower bound
               (let [new-los (.seek-gte iterator scratch-key)]
                 (if (nil? new-los)
                   (set! (.-failed? solver) true)
                   (loop [i 0]
                     (when (< i (alength vars))
                       (let [var (aget vars i)]
                         (.set-lo solver var (aget new-los i))
                         (if (identical? (aget new-los i) (aget his var))
                           (recur (+ i 1))
                           (.set-watch solver var constraint true)))))))))
  (split-left [this solver constraint]
              ;; fix the value of the first non-fixed var
              (let [los (.-los solver)
                    his (.-his solver)]
                (loop [i 0]
                  (if (< i (alength vars))
                    (let [var (aget vars i)]
                      (if (identical? (aget los var) (aget his var))
                        (recur (+ i 1))
                        (do
                          (.set-hi solver var (aget los var))
                          (when (< (+ i 1) (alength vars))
                            (.set-watch solver (aget vars (+ i 1)) constraint true))
                          (.propagate this solver constraint)
                          true)))
                    false))))
  (split-right [this solver constraint]
               (let [los (.-los solver)
                     his (.-his solver)]
                 ;; copy the los
                 (dotimes [i (alength vars)]
                   (let [var (aget vars i)]
                     (aset scratch-key i (aget los var))))
                 ;; find the upper bound for the left branch...
                 (loop [i 0]
                   (when (< i (alength vars))
                     (let [var (aget vars i)]
                       (if (identical? (aget scratch-key i) (aget his var))
                         (recur (+ i 1))
                         (loop [i (+ i 1)]
                           (when (< i (alength vars))
                             (aset scratch-key i greatest)
                             (recur (+ i 1))))))))
                 ;; ...and then seek past it
                 (let [new-los (.seek-gt iterator scratch-key)]
                   (debug :seeking-past scratch-key new-los)
                   (if (nil? new-los)
                     (set! (.-failed? solver) true)
                     (loop [i 0]
                       (when (< i (alength vars))
                         (let [var (aget vars i)]
                           (.set-lo solver var (aget new-los i))
                           (if (identical? (aget new-los i) (aget his var))
                             (recur (+ i 1)))))))))))

(defn contains [iterator vars]
  (let [key-len (.-key-len (.-tree iterator))]
    (Contains. iterator vars (make-array key-len))))

(deftype Constant [c var]
  Object
  (reset [this solver constraint])
  (split-left [this solver constraint]
              false)
  (split-right [this solver constraint])
  (propagate [this solver constraint]
             (.set-eq solver var c)))

(defn constant [c var]
  (Constant. c var))

(deftype Equal [vars]
  Object
  (reset [this solver constraint]
         (dotimes [i (alength vars)]
           (.set-watch solver (aget vars i) constraint true)))
  (split-left [this solver constraint]
              false)
  (split-right [this solver constraint])
  (propagate [this solver constraint]
             (let [los (.-los solver)
                   his (.-his solver)]
               (loop [i 0]
                 (when (< i (alength vars))
                   (let [var (aget vars i)]
                     (if (identical? (aget los var) (aget his var))
                       (dotimes [j (alength vars)]
                         (.set-eq solver (aget vars j) (aget los var)))
                       (recur (+ i 1)))))))))

(defn equal [vars]
  (Equal. vars))

(deftype Function [f var vars scratch]
  Object
  (reset [this solver constraint]
         (dotimes [i (alength vars)]
           (.set-watch solver (aget vars i) constraint true)))
  (split-left [this solver constraint]
              false)
  (split-right [this solver constraint])
  (propagate [this solver constraint]
             (let [los (.-los solver)
                   his (.-his solver)]
               (loop [i 0]
                 (if (< i (alength vars))
                   (let [var (aget vars i)]
                     (when (identical? (aget los var) (aget his var))
                       (aset scratch i (aget los var))
                       (recur (+ i 1))))
                   (let [val (.apply f nil scratch)]
                     (.set-eq solver var val)))))))

(defn function [f var vars]
  (Function. f var vars (make-array (alength vars))))

(deftype Filter [f vars scratch]
  Object
  (reset [this solver constraint]
         (dotimes [i (alength vars)]
           (.set-watch solver (aget vars i) constraint true)))
  (split-left [this solver constraint]
              false)
  (split-right [this solver constraint])
  (propagate [this solver constraint]
             (let [los (.-los solver)
                   his (.-his solver)]
               (loop [i 0]
                 (if (< i (alength vars))
                   (let [var (aget vars i)]
                     (when (identical? (aget los var) (aget his var))
                       (aset scratch i (aget los var))
                       (recur (+ i 1))))
                   (when (false? (.apply f nil scratch))
                     (set! (.-failed? solver) true)))))))

(defn filter [f vars]
  (Filter. f vars (make-array (alength vars))))

(deftype Interval [in-var lo-var hi-var]
  Object
  (reset [this solver constraint]
         (.set-watch solver lo-var constraint true)
         (.set-watch solver hi-var constraint true))
  (split-left [this solver constraint]
              (let [los (.-los solver)
                    his (.-his solver)
                    lo-lo (aget los lo-var)
                    hi-lo (aget his lo-var)
                    lo-hi (aget los hi-var)
                    hi-hi (aget his hi-var)
                    in-lo (aget los in-var)
                    in-hi (aget his in-var)]
                (if (and (== lo-lo hi-lo) (== lo-hi hi-hi) (not (== in-lo in-hi)))
                  (do
                    (.set-hi solver in-var (js/Math.ceil in-lo))
                    true)
                  false)))
  (split-right [this solver constraint]
               (let [in-lo (aget (.-los solver) in-var)]
                 (.set-lo solver in-var (+ (js/Math.ceil in-lo) 1))))
  (propagate [this solver constraint]
             (.set-lo solver in-var (aget (.-los solver) lo-var))
             (.set-hi solver in-var (aget (.-his solver) hi-var))))

(defn interval [in-var lo-var hi-var]
  (Interval. in-var lo-var hi-var))

;; SOLVER

;; los and his are inclusive

(deftype Solver [constraints ^:mutable failed? ^:mutable depth
                 los his var->constraint->watching? constraint->dirty?
                 pushed-los pushed-his pushed-var->constraint->watching? pushed-constraint->dirty? pushed-splitters]
  Object
  (reset [this]
         (set! depth 0)
         (set! failed? false)
         (dotimes [i (alength los)]
           (aset los i least)
           (aset his i greatest))
         (dotimes [i (alength var->constraint->watching?)]
           (aset var->constraint->watching? i false))
         (dotimes [i (alength constraint->dirty?)]
           (aset constraint->dirty? i true))
         (aclear pushed-los)
         (aclear pushed-his)
         (aclear pushed-var->constraint->watching?)
         (aclear pushed-constraint->dirty?)
         (aclear pushed-splitters)
         (dotimes [constraint (alength constraints)]
           (.reset (aget constraints constraint) this constraint)))
  (set-lo [this var new-lo]
          (when-not (identical? (aget los var) new-lo)
            (if (val-lt (aget his var) new-lo)
              (set! failed? true)
              (do
                (aset los var new-lo)
                (.set-dirty this var)))))
  (set-hi [this var new-hi]
          (when-not (identical? (aget his var) new-hi)
            (if (val-lt new-hi (aget los var))
              (set! failed? true)
              (do
                (aset his var new-hi)
                (.set-dirty this var)))))
  (set-eq [this var new-val]
          (let [old-lo (aget los var)
                old-hi (aget his var)]
            (when-not (and (identical? old-lo new-val) (identical? old-hi new-val))
              (if (or (val-lt new-val old-lo) (val-lt old-hi new-val))
                (set! failed? true)
                (do
                  (aset los var new-val)
                  (aset his var new-val)
                  (.set-dirty this var))))))
  (set-watch [this var constraint value]
             (aset var->constraint->watching? (+ (* (alength constraints) var) constraint) value))
  (set-dirty [this var]
             (let [start (* (alength constraints) var)]
               (dotimes [constraint (alength constraints)]
                 (when (true? (aget var->constraint->watching? (+ start constraint)))
                   (aset constraint->dirty? constraint true)))))
  (split [this]
         (debug :splitting-left los his)
         (apush-into depth los pushed-los)
         (apush-into depth his pushed-his)
         (apush-into depth var->constraint->watching? pushed-var->constraint->watching?)
         (apush-into depth constraint->dirty? pushed-constraint->dirty?)
         (set! depth (+ depth 1))
         (loop [splitter 0]
           (if (< splitter (alength constraints))
             (if (true? (.split-left (aget constraints splitter) this splitter))
               (do
                 (apush pushed-splitters splitter)
                 (debug :split-left los his splitter))
               (recur (+ splitter 1)))
             (assert false "Can't split anything!"))))
  (backtrack [this]
             (set! failed? false)
             (set! depth (- depth 1))
             (apop-from depth los pushed-los)
             (apop-from depth his pushed-his)
             (apop-from depth var->constraint->watching? pushed-var->constraint->watching?)
             (apop-from depth constraint->dirty? pushed-constraint->dirty?)
             (let [splitter (.pop pushed-splitters)]
               (debug :splitting-right los his splitter)
               (.split-right (aget constraints splitter) this splitter)
               (debug :split-right los his splitter failed?)))
  (next [this]
        (debug :next los his pushed-los pushed-his)
        (loop [constraint 0]
          (if (true? failed?)
            (do
              (debug :failed)
              (when (> depth 0)
                (.backtrack this)
                (recur 0)))
            (if (< constraint (alength constraints))
              (if (false? (aget constraint->dirty? constraint))
                (recur (+ constraint 1))
                (do
                  (debug :propagating constraint los his)
                  (.propagate (aget constraints constraint) this constraint)
                  (aset constraint->dirty? constraint false) ;; constraint is responsible for detecting if it causes itself more work
                  (debug :propagated constraint los his)
                  (recur 0)))
              (if (key= los his)
                (do
                  (set! failed? true) ;; force solver to backtrack next time
                  (debug :done los)
                  (aclone los))
                (do
                  (.split this)
                  (recur 0)))))))
  (keys [this]
        (let [results #js []]
          (loop []
            (let [result (.next this)]
              (when-not (nil? result)
                (apush results result)
                (recur))))
          results))
  ISeqable
  (-seq [this]
        (seq (.keys this))))

(defn solver [num-vars constraints]
  (let [los (least-key num-vars)
        his (greatest-key num-vars)
        var->constraint->watching? (amake [_ (* num-vars (alength constraints))] false)
        constraint->dirty? (amake [_ (alength constraints)] true)]
    (Solver. constraints false 0
             los his var->constraint->watching? constraint->dirty?
             #js [] #js [] #js [] #js [] #js [])))

;; TESTS

(defn gen-key [key-len]
  (gen/fmap into-array (gen/vector (gen/one-of [gen/int gen/string-ascii]) key-len)))

(defn least-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-lt (least-key key-len) key)
                     (key-lte (least-key key-len) key)
                     (key-gt key (least-key key-len))
                     (key-gte key (least-key key-len)))))

(defn greatest-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-gt (greatest-key key-len) key)
                     (key-gte (greatest-key key-len) key)
                     (key-lt key (greatest-key key-len))
                     (key-lte key (greatest-key key-len)))))

(defn equality-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (= (key= key-a key-b)
                   (and (key-lte key-a key-b) (not (key-lt key-a key-b)))
                   (and (key-gte key-a key-b) (not (key-gt key-a key-b))))))

(defn reflexive-prop [key-len]
  (prop/for-all [key (gen-key key-len)]
                (and (key-lte key key) (key-gte key key) (not (key-lt key key)) (not (key-gt key key)))))

(defn transitive-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)
                 key-c (gen-key key-len)]
                (and (if (and (key-lt key-a key-b) (key-lt key-b key-c)) (key-lt key-a key-c) true)
                     (if (and (key-lte key-a key-b) (key-lte key-b key-c)) (key-lte key-a key-c) true)
                     (if (and (key-gt key-a key-b) (key-gt key-b key-c)) (key-gt key-a key-c) true)
                     (if (and (key-gte key-a key-b) (key-gte key-b key-c)) (key-gte key-a key-c) true))))

(defn anti-symmetric-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (and (not (and (key-lt key-a key-b) (key-lt key-b key-a)))
                     (not (and (key-gt key-a key-b) (key-gt key-b key-a))))))

(defn total-prop [key-len]
  (prop/for-all [key-a (gen-key key-len)
                 key-b (gen-key key-len)]
                (and (or (key-lt key-a key-b) (key-gte key-a key-b))
                     (or (key-gt key-a key-b) (key-lte key-a key-b)))))

;; fast gens with no shrinking and no long strings. good enough for government work

(defn make-simple-key-elem [rnd size]
  (let [value (gen/rand-range rnd (- size) size)]
    (if (pprng/boolean rnd)
      value
      (str value))))

(defn make-simple-key [rnd size key-len]
  (let [result #js []]
    (dotimes [_ key-len]
      (.push result (make-simple-key-elem rnd size)))
    result))

(defn make-simple-delta [rnd size]
  (let [delta (gen/rand-range rnd (- size) size)]
    (if (== delta 0)
      (+ delta 1)
      delta)))

(defn gen-update [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)]
       (if (pprng/boolean rnd)
         [[:add key] nil]
         [[:del key] nil])))))

(defn apply-to-tree [tree updates]
  [tree
   (doall
    (for [update updates]
      (case (nth update 0)
        :add (.add tree (nth update 1))
        :del (.del tree (nth update 1)))))])

(defn apply-to-sorted-map [map updates]
  (let [map (atom map)
        results (doall
                 (for [update updates]
                   (let [key (nth update 1)
                         old (get @map key)]
                     (case (nth update 0)
                       :add (do
                              (swap! map assoc key)
                              old)
                       :del (do
                              (swap! map dissoc key)
                              old)))))]
    [@map results]))

(defn run-building-prop [min-keys key-len updates]
  (let [[tree tree-results] (apply-to-tree (tree min-keys key-len) updates)
        [sorted-map sorted-map-results] (apply-to-sorted-map (sorted-map-by key-compare) updates)]
    (and (= (seq tree) (seq sorted-map))
         (= tree-results sorted-map-results)
         (.valid! tree))))

(defn building-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 updates (gen/vector (gen-update key-len))]
                (run-building-prop min-keys key-len updates)))

(defn gen-movement [key-len]
  (gen/make-gen
   (fn [rnd size]
     (let [key (make-simple-key rnd size key-len)]
       (if (pprng/boolean rnd)
         [[:seek-gt key] nil]
         [[:seek-gte key] nil])))))

(defn apply-to-iterator [iterator movements]
  (for [movement movements]
    (case (nth movement 0)
      :seek-gt (.seek-gt iterator (nth movement 1))
      :seek-gte (.seek-gte iterator (nth movement 1)))))

(defn apply-to-elems [elems movements]
  (let [cur-elems (atom elems)]
    (for [movement movements]
      (case (nth movement 0)
        :seek-gt (do
                   (reset! cur-elems (drop-while #(key-lte (nth % 0) (nth movement 1)) elems))
                   (first (first @cur-elems)))
        :seek-gte (do
                    (reset! cur-elems (drop-while #(key-lt (nth % 0) (nth movement 1)) elems))
                    (first (first @cur-elems)))))))

(defn run-iterator-prop [min-keys key-len updates movements]
  (let [[tree _] (apply-to-tree (tree min-keys key-len) updates)
        [sorted-map _] (apply-to-sorted-map (sorted-map-by key-compare) updates)
        iterator-results (apply-to-iterator (iterator tree) movements)
        elems-results (apply-to-elems (seq sorted-map) movements)]
    #_(.pretty-print tree)
    (= iterator-results elems-results)))

(defn iterator-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 updates (gen/vector (gen-update key-len))
                 movements (gen/vector (gen-movement key-len))]
                (run-iterator-prop min-keys key-len updates movements)))

(defn run-self-join-prop [min-keys key-len updates]
  (let [[tree _] (apply-to-tree (tree min-keys key-len) updates)
        solver (solver
                key-len
                #js [(contains (iterator tree) (into-array (range key-len)))
                     (contains (iterator tree) (into-array (range key-len)))])
        tree-keys (.keys tree)]
    (prim= tree-keys (.keys solver))))

(defn self-join-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 updates (gen/vector (gen-update key-len))]
                (run-self-join-prop min-keys key-len updates)))

(defn run-product-join-prop [min-keys key-len updates]
  (let [product-tree (tree min-keys key-len)
        [tree _] (apply-to-tree (tree min-keys key-len) updates)
        keys (.keys tree)
        _ (dotimes [i (alength keys)]
            (dotimes [j (alength keys)]
              (.add product-tree (.concat (aget keys i) (aget keys j)))))
        solver (solver
                (* 2 key-len)
                #js [(contains (iterator tree) (into-array (range 0 key-len)))
                     (contains (iterator tree) (into-array (range key-len (* 2 key-len))))])]
    (prim= (.keys product-tree) (.keys solver))))

(defn product-join-prop [key-len]
  (prop/for-all [min-keys gen/s-pos-int
                 updates (gen/vector (gen-update key-len))]
                (run-product-join-prop min-keys key-len updates)))

(comment
  (dc/quick-check 1000 (least-prop 1))
  (dc/quick-check 1000 (least-prop 2))
  (dc/quick-check 1000 (greatest-prop 1))
  (dc/quick-check 1000 (greatest-prop 2))
  (dc/quick-check 1000 (equality-prop 1))
  (dc/quick-check 1000 (equality-prop 2))
  (dc/quick-check 1000 (reflexive-prop 1))
  (dc/quick-check 1000 (reflexive-prop 2))
  (dc/quick-check 1000 (transitive-prop 1))
  (dc/quick-check 1000 (transitive-prop 2))
  (dc/quick-check 1000 (anti-symmetric-prop 1))
  (dc/quick-check 1000 (anti-symmetric-prop 2))
  (dc/quick-check 1000 (total-prop 1))
  (dc/quick-check 1000 (total-prop 2))
  (dc/quick-check 10000 (building-prop 1))
  (dc/quick-check 10000 (iterator-prop 1))
  (dc/quick-check 10000 (self-join-prop 1))
  (dc/quick-check 10000 (self-join-prop 2))
  (dc/quick-check 10000 (self-join-prop 3))
  (dc/quick-check 10000 (product-join-prop 1))
  (dc/quick-check 10000 (product-join-prop 2))
  (dc/quick-check 10000 (product-join-prop 3))

  (defn f []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree #js [i i i] (* 2 i))))))

  (time (dotimes [_ 10] (f)))

  (defn g []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree (if (even? i) #js [i i i] #js [(str i) (str i) (str i)]) (* 2 i))))))

  (time (dotimes [_ 10] (g)))

  (defn h []
    (time
     (let [tree (tree 100)]
       (dotimes [i 500000]
         (.assoc! tree #js [(js/Math.sin i) (js/Math.cos i) (js/Math.tan i)] (* 2 i))))))

  (time (dotimes [_ 10] (h)))

  (do
    (def samples (gen/sample (gen/tuple gen/s-pos-int (gen/vector gen-update) (gen/vector gen-movement)) 100))
    (def trees (for [[min-keys updates _] samples]
                 (apply-to-tree (tree min-keys) updates)))
    (def benches (mapv vector trees (map #(nth % 2) samples)))
    (time
     (doseq [[tree movements] benches]
       (apply-to-iterator (iterator tree) movements))))

   (let [tree1 (tree 10)
         _ (dotimes [i 10000]
             (let [i (+ i 0)]
               (.assoc! tree1 #js [i (+ i 1) (+ i 2)] (* 2 i))))
         tree2 (tree 10)
         _ (dotimes [i 1000]
             (let [i (+ i 1)]
               (.assoc! tree2 #js [i (+ i 2)] (* 2 i))))
         tree3 (tree 10)
         _ (dotimes [i 100000]
             (let [i (+ i 2)]
               (.assoc! tree3 #js [(+ i 1) (+ i 2)] (* 2 i))))
         ]
     (perf-time
      (let [s (solver 3 #js [(contains (iterator tree1) #js [0 1 2])
                             (contains (iterator tree2) #js [0 2])
                             (contains (iterator tree3) #js [1 2])])]
        (while (not (nil? (.next s)))))))

  (let [tree1 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 0)]
                (.assoc! tree1 #js [i i i] (* 2 i))))
          tree2 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 100000)]
                (.assoc! tree2 #js [i i i] (* 2 i))))
          tree3 (tree 10)
          _ (dotimes [i 100000]
              (let [i (+ i 50000)]
                (.assoc! tree3 #js [i i i] (* 2 i))))
          ]
      (time
       (dotimes [i 100]
         (let [j (join #js [(iterator tree1) (iterator tree2) (iterator tree3)] 3 #js [#js [true true true] #js [true true true] #js [true true true]])]
           (iterator->keys j)))))

  (let [tree (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        j (time (join #js [(iterator tree) (iterator tree)] 3 #js [#js [true true false]
                                                                   #js [false true true]]))
        ]
    (alength (time (iterator->keys j)))
    )

  (let [tree (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        j (time (join #js [(iterator tree) (iterator tree) (iterator tree)] 6 #js [#js [true false false true false false]
                                                                                   #js [false true false false true false]
                                                                                   #js [false false true false false true]]))
        ]
    (alength (time (iterator->keys j)))
  )

  (let [tree (tree 10)
        _ (dotimes [i 10]
            (let [i (+ i 0)]
              (.assoc! tree #js [i i] (* 2 i))))
        j (time (join #js [(iterator tree) (iterator tree) (iterator tree)] 6 #js [#js [true false false false false true]
                                                                                   #js [false true false false true false]
                                                                                   #js [false false true true false false]]))
        ]
    (alength (time (iterator->keys j)))
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      tree2 (tree 10)
      _ (.assoc! tree2 #js ["b" "a"] 0)
      _ (.assoc! tree2 #js ["c" "b"] 0)
      _ (.assoc! tree2 #js ["d" "c"] 0)
      _ (.assoc! tree2 #js ["b" "d"] 0)
      s (solver 3
                #js [(contains (iterator tree1))
                     (contains (iterator tree2))]
                #js [#js [0 2]
                     #js [1 2]])
      ]
  [(.next s) (.next s) (.next s)]
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      s (solver 4
                #js [(contains (iterator tree1))
                     (contains (iterator tree1))]
                #js [#js [0 1]
                     #js [2 3]])
      ]
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      tree2 (tree 10)
      _ (.assoc! tree2 #js ["b" "a"] 0)
      _ (.assoc! tree2 #js ["c" "b"] 0)
      _ (.assoc! tree2 #js ["d" "c"] 0)
      _ (.assoc! tree2 #js ["b" "d"] 0)
      s (solver 3
                #js [(contains (iterator tree1) #js [0 2])
                     (contains (iterator tree2) #js [1 2])])
      ]
    (.reset s)
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      tree2 (tree 10)
      _ (.assoc! tree2 #js ["b" "a"] 0)
      _ (.assoc! tree2 #js ["c" "b"] 0)
      _ (.assoc! tree2 #js ["d" "c"] 0)
      _ (.assoc! tree2 #js ["b" "d"] 0)
      s (solver 4
                #js [(contains (iterator tree1) #js [0 1])
                     (contains (iterator tree2) #js [2 3])
                     (function identity 1 #js [3])])
      ]
    (.reset s)
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      tree2 (tree 10)
      _ (.assoc! tree2 #js ["b" "a"] 0)
      _ (.assoc! tree2 #js ["c" "b"] 0)
      _ (.assoc! tree2 #js ["d" "c"] 0)
      _ (.assoc! tree2 #js ["b" "d"] 0)
      s (solver 4
                #js [(contains (iterator tree1) #js [0 1])
                     (contains (iterator tree2) #js [2 3])
                     (equal #js [1 3])])
      ]
    (.reset s)
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

  (let [tree1 (tree 10)
      _ (.assoc! tree1 #js ["a" "b"] 0)
      _ (.assoc! tree1 #js ["b" "c"] 0)
      _ (.assoc! tree1 #js ["c" "d"] 0)
      _ (.assoc! tree1 #js ["d" "b"] 0)
      tree2 (tree 10)
      _ (.assoc! tree2 #js ["b" "a"] 0)
      _ (.assoc! tree2 #js ["c" "b"] 0)
      _ (.assoc! tree2 #js ["d" "c"] 0)
      _ (.assoc! tree2 #js ["b" "d"] 0)
      s (solver 4
                #js [(contains (iterator tree1) #js [0 1])
                     (contains (iterator tree2) #js [2 3])
                     (filter = #js [1 3])])
      ]
    (.reset s)
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

  (let [s (solver 3
                  #js [(interval 0 1 2)
                       (constant 0 1)
                       (constant 10 2)])
      ]
    (.reset s)
  (take 100 (take-while identity (repeatedly #(.next s))))
  )

 )
