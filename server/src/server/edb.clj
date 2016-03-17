(ns server.edb)

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
  
(defn create-edb []
  (let [tuples (atom '())
        by-attribute ()
        listeners (atom '())
        index-map  {insert-oid
                    (fn [c]
                      (fn [tuple]
                        (when (= (tuple 0) 'insert)
                          (swap! tuples conj tuple)
                          (doseq [i @listeners] (i tuple)))))
                    
                    full-scan-oid
                    (fn [c]
                      (fn [tuple]
                        (println "full scan" tuple)
                        (if (= (tuple 0) 'flush)
                          (c tuple)
                          (doseq [i @tuples] (c 'insert i)))))

                    attribute-scan-oid
                    (fn [c]
                      (fn [tuple]
                        (doseq [i @tuples] (c 'insert i))))
                    }]

    (fn [index c] ((index-map index) c)))) 


