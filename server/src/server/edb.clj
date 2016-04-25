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
     (let [f [(atom '()) (atom #{})]]      
       (swap! edb assoc bag-id f)
       f))))

(defn create-bag [edb bag-id references]
  (install-bag edb bag-id))

(defn create-view [edb bag-id user]
  [(install-bag edb bag-id) user])

(defn tuples [view] ((view 0) 0))
(defn listeners [view] ((view 0) 1))
(defn user [view] (view 1))

(defn add-listener [view id c]
  (swap! (listeners view) conj [c id])
  (fn [] (swap! (listeners view) disj [c id])))

(defn insert [view eav id c]
  (let [t (now)
        tuple (object-array (vector (aget eav 0)
                                    (aget eav 1)
                                    (aget eav 2)
                                    t
                                    (user view)))]
    (println "insert" (map str tuple))
    (swap! (tuples view) conj tuple)
    (doseq [i @(listeners view)]
      ((i 0) 'insert tuple (i 1)))
    (c t)))

(defn flush-bag [view id]
  (doseq [i @(listeners view)]
    (when (not (= id (i 1)))
          ((i 0) 'flush [] (i 1)))))

(defn full-scan [view id c]
  (doseq [i @(tuples view)]
    (c 'insert (object-array [(aget i 0)
                              (aget i 1)
                              (aget i 2)
                              0
                              (aget i 3)
                              (aget i 4)])
       id))
  (add-listener view id c))

(defn open-new-view [view bag-id] )
