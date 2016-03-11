(ns server.repl
  (:require [server.db :as db]
            [server.edb :as edb]
            [server.log :as log]
            [server.compiler :as compiler]
            [server.serialize :as serialize]
            [server.exec :as exec]))

(def bag (atom 98))
(def user (atom 99))

(defn repl-error [& thingy]
  (apply println "repl error" thingy)
  (throw thingy))

;; the distinction between edb and idb is alive here..skating over it
(defn build-reporting-select [db terms]
  (let [keys (filter symbol? (vals (apply hash-map (rest terms))))]
    (compiler/compile-dsl db @bag (list terms (list 'return keys)))))

(defn show [d expression]
   (let [prog (build-reporting-select d (second expression))]
     (println (exec/print-program prog))))

(defn diesel [d expression]
  ;; the compile-time error path should come up through here
  ;; fix external number of regs
  (let [prog (build-reporting-select d expression)]
    ((exec/open d prog (fn [op tuple] (println "whee" tuple))) 'flush [])))


;; xxx - this is now...in the language..not really?
(defn define [d expression]
  (let [deconstruct (fn deconstruct [t] 
                      (if (or (empty? t) (list? (first t))) t
                          (if (and (symbol? (first t)) (vector? (second t)))
                            (db/insert-implication d (name (first t)) (second t) 
                                                   (deconstruct (rest (rest t))) @user @bag)
                            (repl-error "poorly formed define" t))))]
    (deconstruct (rest expression))))

(declare read-all)

;; xxx - use the provenance compiler
(defn trace [db tuple] ())
  
  
(defn eeval [d term]
  (let [function ({'trace trace
                   'define define
                   'show show
                   'load read-all
                   } (first term))]
    (if (nil? function)
      (diesel d term)
      (function d term))))

(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(defn read-all [db expression]
  ;; trap file not found
  ;; need to implement load path here!

  (let [filename (second expression) 
        rdr (try (-> (.getPath (clojure.java.io/resource filename)) io/file io/reader PushbackReader.) 
                 (catch Exception e (-> filename io/file io/reader PushbackReader.)))]
    
    (loop []
      ;; terrible people, always throw an error, even on an eof, so cant print read errors? (println "load parse error" e)
      (let [form (try (read rdr) (catch Exception e ()))]
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

