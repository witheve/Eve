(ns aurora.data)

(deftype FactMap [^:mutable root
                  ^:mutable count]
  Object
  (toString [coll]
            (pr-str* coll))

  (assoc! [tcoll k v]
          (assert (not (nil? k)) "Nil key")
          (let [added-leaf? (Box. false)
                node (.inode-assoc! root false 0 (.hash k) k v added-leaf?)]
            (set! root node)
            (if ^boolean (.-val added-leaf?)
              (set! count (+ count 1)))
            (.-val added-leaf?)))

  ;; TODO does dissoc ever leave the root nil?
  (without! [tcoll k]
    (assert (not (nil? k)) "Nil key")
    (let [removed-leaf? (Box. false)
          node (.inode-without! root false 0 (.hash k) k removed-leaf?)]
      (set! root node)
      (if (aget removed-leaf? 0)
        (set! count (- count 1)))
      (.-val removed-leaf?)))

  (count [coll]
         count)

  (lookup [tcoll k]
          (assert (not (nil? k)) "Nil key")
          (.inode-lookup root 0 (.hash k) k))

  (lookup [tcoll k not-found]
          (assert (not (nil? k)) "Nil key")
          (.inode-lookup root 0 (.hash k) k not-found))

  ISeqable
  (-seq [this]
       (when (pos? count)
         (.inode-seq (.-root this))))

  IPrintWithWriter
  (-pr-writer [o writer opts]
              (-pr-writer (into {} o) writer opts)))

(defn fact-map []
  (FactMap. cljs.core.BitmapIndexedNode.EMPTY 0))

(comment
  (let [u (fact-map)]
    (time
     (dotimes [i 10000000]
       (let [values #js [(mod i 1000) (mod i 100) (mod i 10)]
             fact (aurora.language.Fact. nil values (aurora.language/fact-hash values))]
         (.assoc! u fact fact))))
    (seq u))
    ;; (.lookup u (aurora.language.Fact. nil #js [1 1 1] (aurora.language/fact-hash #js [1 1 1]))))

  (fact-map)
  )
