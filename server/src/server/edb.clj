(ns server.edb)

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
                      (fn [op tuple]
                        (swap! tuples conj tuple)
                        (doseq [i @listeners] (i op tuple))))
                    
                    full-scan-oid
                    (fn [c]
                      (fn [op tuple]
                        (doseq [i @tuples] (c 'insert i))))

                    attribute-scan-oid
                    (fn [c]
                      (fn [op tuple]
                        (doseq [i @tuples] (c 'insert i))))
                    }]

    (fn [index c] ((index-map index) c)))) 


