(ns server.db
  (:require [server.edb :as edb]
            [server.exec :as exec]))


;; need to put some thought into what this timestamp is
;; should probably (?) be at least monotonic, and likely
;; include some form of node identity
(defn now[] (System/currentTimeMillis))

;; in the nwo this should open the insert endpoint and then close it
(defn insert [db e a v b u]
  ((db edb/insert-oid (fn [o t] ())) 'insert (list e a v b (now) u)))


(def uber-log (atom ()))

;; maybe in the db?
(def oidcounter (atom 100))
(defn genoid [] (swap! oidcounter (fn [x] (+ x 1))))
;; permanent allocations
(def name-oid 10)
(def implication-oid 11)
(def contains-oid 12)

(defn insert-implication [db relname parameters program user bag]
  (insert db (name relname)
          implication-oid (list (map name parameters) program) user bag))

(defn weasl-implications-for [id]
  (list
   (list 'bind [3] [1]
         ;; i guess op is explicit now...so we'd better copy it
         (list (list 'move 0 [2 0])
               (list '= [3] [2 1] id) '(filter [3])
               (list '= [3] [2 2] implication-oid) '(filter [3])
               (list 'tuple [4] [1 0] [2 3])
               (list 'send [1] [4])))
   (list 'open [3] edb/full-scan-oid [3])
   (list 'tuple [4] [0])
   (list 'send [3] [4])))

(defn for-each-implication [d id handler]
  (exec/single d (weasl-implications-for id)
               (fn [tuple]
                 (when (= (tuple 0) 'insert)
                   (handler (first tuple) (second tuple))))))


;; @FIXME: This relies on exec/open flushing synchronously to determine if the implication currently exists
(defn implication-of [d id]
  (let [impl (atom nil)
        terminus (fn [tuple]
                   (when (= (tuple 0) 'insert)
                     (reset! impl tuple)))]
    (exec/single d (weasl-implications-for id)
                 (fn [tuple]
                   (when (= (tuple 0) 'insert)
                     (reset! impl tuple))))
    @impl))
                   

