(ns server.edb)


;; need to put some thought into what this timestamp is
;; should probably (?) be at least monotonic, and likely
;; include some form of node identity (and insert batch
;; bits)
;; this doesn't belong here - depending on the consistency
;; story

(def current-milli (ref 0))
(def current-count (ref 0))

;; this is a long with milli and a count...we need to stuff intra-batch
;; bits in here also
(defn now[]
  (dosync 
   (let [k (System/currentTimeMillis)]
     (if (> k @current-milli)
       (do
;         (ref-set current-count 0))
         (ref-set current-milli k)
         (do
           (alter current-count + 1))))
     (bit-or (bit-shift-left @current-milli 20) @current-count))))

;; xxx - reconcile with smil
(def remove-oid 5)

(def insert-oid 20)
(def full-scan-oid 21)
(def attribute-scan-oid 22)
  
(def index-map
  ;e a v
  {[true  false false] full-scan-oid
   [false true  false] full-scan-oid
   [false false true] full-scan-oid
   [true  true  false] full-scan-oid
   [false true  true] full-scan-oid
   [true  false true] full-scan-oid
   [true  true  true] full-scan-oid
  })


;; there is a consistency problem with tuples and listeners
(defn create-edb [user]
  (let [tuples (atom '())
        by-attribute ()
        listeners (atom #{})
        index-map  {insert-oid
                    (fn [eavb c]
                      (let [t (now)
                            tuple (object-array (vector (aget eavb 0)
                                                        (aget eavb 1)
                                                        (aget eavb 2)
                                                        (aget eavb 3)
                                                        t
                                                        user))]
                        (swap! tuples conj tuple)
                        (doseq [i @listeners] (i tuple))
                        (c tuple)
                        (fn [] ())))
                    
                    full-scan-oid
                    (fn [key c]
                      (swap! listeners conj c)
                      (doseq [i @tuples] (c i))
                      (fn [] (swap! listeners disj c)))}]

    
    (fn [index key c]
      ((index-map index) key c))))


