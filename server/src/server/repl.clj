(ns server.repl
  (:require [server.db :as db]
            [server.edb :as edb]
            [server.log :as log]
            [server.compiler :as compiler]
            [server.serialize :as serialize]
            [server.exec :as exec]))

(def bag (atom 10))
(def user (atom 20))

;; the distinction between edb and idb is alive here..skating over it
(defn build-reporting-select [db terms]
  (let [keys (filter symbol? (map second (split-at 2 (rest terms))))]
    (compiler/compile-dsl db @bag (list terms (list 'return keys)))))

(defn show [d expression]
   (let [prog (build-reporting-select d (second expression))]
     (println (exec/print-program prog))))

(defn implied-select [d expression]
  ;; the compile-time error path should come up through here
  ;; fix external number of regs
  (let [prog (build-reporting-select d expression)]
    ((exec/open [] d prog 10) 'flush [])))

                   
;; xxx - projections with shared bodies are duplicated
;; projections in nested scopes are just ignored

;; xxx - this is now...in the language..not really?
(defn define [d expression]
  ;; we can do a recursive rewrite with returns and truncation I guess?
  (let [separate (group-by (fn [x] (= (first x) 'project)) (rest expression))]
    (doseq [i (separate true)]
      (let [relname (name (second i))
            sig 0
            keys (rest (rest i))
            keyo (partition 2 keys)]
        (db/insert-implication d relname keyo (separate false)
                            @user @bag)))))


;; xxx - we should associate this with the timestamp (i.e rowid)
;; of a particular row...because composition..not sure
;; how to deal with that guy here, we need to have the original in hand
(defn remove-tuple [d tuple]
  (let [terms (apply hash-map (rest (rest tuple)))
        n (name (second tuple))
        t0 (db/now)]
    ;; remove is an oid..xxx - this is now in the language
    (db/insert d t0 'remove 0)))


(defn repl-insert-tuple [d tuple]
  ;; bid
  (db/insert d (nth tuple 2) (nth tuple 1) (nth tuple 3) @bag @user))

(declare read-all)

;; xxx - use the provenance compiler
(defn trace [db tuple] ())
  
  
(defn eeval [db term]
  (let [function ({'insert repl-insert-tuple
                   'remove remove-tuple
                   'trace trace
                   'define define
                   'show show
                   'load read-all
                   } (first term))]
    (if (not (nil? function))
      (function db term)
      (implied-select db term))
    db))

(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(defn read-all [db expression]
  ;; trap file not found
  ;; need to implement load path here!

  (let [filename (second expression) 
        rdr (try (-> (.getPath (clojure.java.io/resource filename)) io/file io/reader PushbackReader.) 
                 (catch Exception e (-> filename io/file io/reader PushbackReader.)))]
    
    (loop []
      ;; fuckers, always throw an error, even on an eof, so cant print read errors? (println "load parse error" e)
      (let [form (try (read rdr) (catch Exception e ()))]
        ;; fucking eof exception
        (if (and form (not (empty? form)))
          (do 
            (eeval db form)
            (recur)))))))
  

(defn rloop [d]
  (loop [d d]
    (doto *out* 
      (.write "eve> ")
      (.flush))
    ;; need to handle read errors, in particular eof
    (recur (eeval d (try
                      ;; it would be nice if a newline on its own got us a new prompt
                      (read)
                      ;; we're-a-gonna assume that this was a graceful close
                       (catch Exception e 
                         (java.lang.System/exit 0)))))))

