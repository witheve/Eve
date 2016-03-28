(ns server.db
  (:require [server.edb :as edb]
            [server.exec :as exec]))


;; in the nwo this should open the insert endpoint and then close it
(defn insert [db e a v b u]
  ((db edb/insert-oid (fn [t] ()))
   (object-array [e a v b])))


(def uber-log (atom ()))

(def name-oid 10)
(def implication-oid 11)
(def contains-oid 12)

(defn insert-implication [db relname parameters program user bag]
  (insert db
          (name relname)
          implication-oid
          (vector (map name parameters) program)
          user
          bag))

;; i would like to use backtick here, but clojure is really screwing
;; up my symbols
(defn weasl-implications-for [id]
  (list (list
         'bind 'main
         (list (list 'scan edb/full-scan-oid [4] [])
               (list '= [5] [4 1] implication-oid)
               '(filter [5])
               (list '= [5] [4 0] id)
               '(filter [5])
               (list 'tuple [5] exec/op-register [4 2])
               (list 'send 'out [5])))))

(defn for-each-implication [d id handler]
  (exec/single d (weasl-implications-for id)
               (fn [tuple]
                 (when (= (aget tuple 0) 'insert)
                   (handler (first (aget tuple 1)) (second (aget tuple 1)))))))


;; @FIXME: This relies on exec/open flushing synchronously to determine if the implication currently exists
(defn implication-of [d id]
  (let [impl (atom nil)]
    (exec/single d (weasl-implications-for id)
                 (fn [tuple]
                   (when (= (aget tuple 0) 'insert)
                     (reset! impl (aget tuple 1)))))
    @impl))
                   

