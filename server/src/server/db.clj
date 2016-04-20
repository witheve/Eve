(ns server.db
  (:require [server.edb :as edb]
            [server.exec :as exec]))


;; in the nwo this should open the insert endpoint and then close it
(defn insert [d e a v b u]
  (d 'insert edb/insert-oid (object-array [e a v b]) (gensym "insert") (fn [op t id] ())))

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
(defn weasl-implications-for [id bag]
  (list (list
         'bind 'main
         (list (list 'scan edb/full-scan-oid [4] [])
               (list '= [5] [4 1] implication-oid)
               '(filter [5])
               (list '= [5] [4 0] id)
               '(filter [5])
               (list 'tuple [5] exec/op-register [4 2])
               (list 'send 'out [5])))))

(defn tuple-to-implication [tuple]
  (exec/rget tuple [1]))

;; plumb bag in here
(defn for-each-implication [d id handler]
  (exec/single d (weasl-implications-for id 0)
               (fn [tuple]
                 (when (= (exec/rget tuple exec/op-register) 'insert)
                   (apply handler (tuple-to-implication tuple))))))


;; @FIXME: This relies on exec/open flushing synchronously to determine if the implication currently exists
;; plumb bag in here
(defn implication-of [d id]
  (let [impl (atom nil)]
    (exec/single d (weasl-implications-for id 0)
                 (fn [tuple]
                   (when (= (exec/rget tuple exec/op-register) 'insert)
                     (reset! impl (tuple-to-implication tuple)))))
    @impl))
