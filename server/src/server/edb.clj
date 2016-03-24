(ns server.edb)


;; need to put some thought into what this timestamp is
;; should probably (?) be at least monotonic, and likely
;; include some form of node identity (and insert batch
;; bits)
;; this doesn't belong here - depending on the consistency
;; story

(def current-milli (atom 0))
(def current-count (atom 0))

;; this is a long with milli and a count...we need to stuff intra-batch
;; bits in here also
(defn now[]
  (let [k (System/currentTimeMillis)]
    (if (= k @current-milli)
      (do
        (swap! current-count (fn [x] (+ x 1))))
      (do
        (swap! current-milli (fn [x] k))
        (swap! current-count (fn [x] 0))))
    (println "tick"  (+ (bit-shift-left @current-milli 20) @current-count))
    (+ (bit-shift-left @current-milli 20) @current-count)))

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

;; xxx - figure out if flush needs to go through this part of town
(defn create-edb [user]
  (let [tuples (atom '())
        by-attribute ()
        listeners (atom #{})
        index-map  {insert-oid
                    (fn [c]
                      (fn [eavb]
                        (let [t (now)
                              tuple (object-array (vector (aget eavb 0)
                                                          (aget eavb 1)
                                                          (aget eavb 2)
                                                          (aget eavb 3)
                                                          t
                                                          user))]
                          (swap! tuples conj tuple)
                          (doseq [i @listeners] (i tuple))
                          (c tuple))))
                    
                    full-scan-oid
                    (fn [c]
                      ;; how were we removing listeners again? serialize list
                      (swap! listeners conj c) 
                      (fn [key]
                        (doseq [i @tuples]
                          (c i))))
                    
                    attribute-scan-oid
                    (fn [c]
                      (fn [key]
                        (doseq [i @tuples] (c i))))}]
    
    (fn [index c]
      ((index-map index) c))))


