(ns server.db
  (:require [server.edb :as edb]
            [server.exec :as exec]))


;; need to put some thought into what this timestamp is
;; should probably (?) be at least monotonic, and likely
;; include some form of node identity
(defn now[] (System/currentTimeMillis))

;; or...perhaps a hash of this
;; this is super dodgy because we're using a list not to conflict with
;; 
(defn implication-identifier [iname keyword-set]
  (println "implication identifier" iname keyword-set)
  (apply list iname (sort (map name keyword-set))))

;; in the nwo this should open the insert endpoint and then close it
(defn insert [db e a v b u]
  ((db 0 (fn [o t] ())) 'insert (list a e v b (now) u)))


(def uber-log (atom ()))

;; maybe in the db?
(def oidcounter (atom 100))
(defn genoid [] (swap! oidcounter (fn [x] (+ x 1))))
;; permanent allocations
(def name-oid 64)
(def implication-oid 65)
(def contains-oid 66)

(defn insert-implication [db relname keyword-map program user bag]
  (insert db (implication-identifier relname (map first keyword-map))
          implication-oid (list keyword-map program) user bag))

(defn for-each-implication [db sig handler]
  ;; only really for insert, right?
  (let [terminus (fn [op tupl] (handler (first (nth tupl 2)) (second (nth tupl 2))))
        prog (list
              (list 'allocate [0] 3) 
              (list 'bind [1] [] 
                    (list (list 'equal [3] [1 1] sig)
                          '(filter [3])
                          (list 'send terminus [1])))
              ;; should have a way to ignore the dest assignment
              (list 'open [3] 0 [1]))
        
        e (exec/open db prog [])]
    (e 'insert [])
    (e 'flush [])
    (e 'close [])))

    


