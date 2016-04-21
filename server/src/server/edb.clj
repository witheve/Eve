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
         (ref-set current-count 0)
         (ref-set current-milli k))
       (alter current-count + 1))
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
  (let [tuples (atom [])
        by-attribute ()
        a (object-array [1])
        
        listeners (atom #{})
        index-map  {insert-oid
                    (fn [key c op id]
                      (when (= op 'insert) 
                        (let [t (now)
                              tuple (object-array (vector (aget key 0)
                                                          (aget key 1)
                                                          (aget key 2)
                                                          (aget key 3)
                                                          t
                                                          user))]
                          (swap! tuples conj tuple)
                          (doseq [i @listeners] ((i 0) tuple op id))
                          (c tuple op id)
                          (fn [] ()))))


                    full-scan-oid
                    (fn [key c op id]
                      (if (= op 'insert)
                        (do
                          (swap! listeners conj [c id])
                          (doseq [i @tuples] (c i op id))
                          (fn [] (swap! listeners disj [c id])))
                        (fn [] ())))}]


    (fn [op index key id c]
      ;; should be if i've said anything that he cared about?
      ;; should in general not issue a flush if nothing has
      ;; changed across a projection also..i think we decided that
      (if (and (= index insert-oid) (= op 'flush))
        (doseq [i @listeners] (when (not (= id (i 1)))
                                ((i 0) [] op id)))
        ((index-map index) key c op id)))))

