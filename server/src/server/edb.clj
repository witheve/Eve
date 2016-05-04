(ns server.edb)

;; xxx - this time and uuid stuff is here just because cyclic dependency, not
;; because it really belongs here

(def current-milli (ref 0))
(def current-count (ref 0))

;; should be a uuid
(def remove-fact 5)

;; bag metadata - contains
;; user metadata
  
(defn now[]
  (dosync 
   (let [k (System/currentTimeMillis)]
     (if (> k @current-milli)
       (do
         (ref-set current-count 0)
         (ref-set current-milli k))
       (alter current-count + 1))
     (bit-or (bit-shift-left @current-milli 20) @current-count))))


;; xxx - reconcile with smil - not used here
(def remove-oid 5)
;; this bag contains that bad at time t
  
(defn create-edb [] (atom {}))

(defn install-bag [edb bag-id]
  (dosync
   (if-let [x (@edb bag-id)] x
     (let [f [(atom '()) (atom #{}) (atom #{})]]     
       (swap! edb assoc bag-id f)
       f))))

(defn create-bag [edb bag-id references]
  (install-bag edb bag-id))

(defn create-view [edb bag-id user]
  [(install-bag edb bag-id) user])

(defn tuples [view] ((view 0) 0))
(defn listeners [view] ((view 0) 1))
(defn flush-listeners [view] ((view 0) 2))
(defn user [view] (view 1))

(defn add-listener [view c]
  (swap! (listeners view) conj c)
  (fn [] (swap! (listeners view) disj c)))

(defn add-flush-listener [view id c]
  (swap! (flush-listeners view) conj [c id])
  (fn [] (swap! (flush-listeners view) disj [c id])))

;; xxx - yuge performance suck

(defn fulltuple-from-local [i]
  (object-array [(aget i 0)
                 (aget i 1)
                 (aget i 2)
                 0
                 (aget i 3)
                 (aget i 4)]))

(defn insert [view eav c]
  (let [t (now)
        tuple (object-array (vector (aget eav 0)
                                    (aget eav 1)
                                    (aget eav 2)
                                    t
                                    (user view)))
        r (fulltuple-from-local tuple)]
    
    (swap! (tuples view) conj tuple)
    (doseq [i @(listeners view)]
      ((i 0) 'insert r (i 1)))
    (c t)))

(defn flush-bag [view id]
  (doseq [i @(flush-listeners view)]
    (when (not (= id (i 1)))
          ((i 0) 'flush [] (i 1)))))

(defn full-scan [view c]
  (doseq [i @(tuples view)]
    (c 'insert (fulltuple-from-local i)))
  (add-listener view c))

(defn open-new-view [view bag-id] )
