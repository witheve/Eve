(ns server.repl
  (:require [server.db :as db]
            [server.edb :as edb]
            [server.log :as log]
            [server.smil :as smil]
            [server.compiler :as compiler]
            [server.serialize :as serialize]
            [clojure.pprint :refer [pprint]]
            [server.exec :as exec]))

(def bag (atom 98))
(def user (atom 99))

(defn repl-error [& thingy]
  (throw thingy))

(defn form-from-smil [z] [z (second z)])

(defn show [d expression]
  (let [[form keys] (form-from-smil (smil/unpack d (second expression)))
        prog (compiler/compile-dsl d @bag form)]
     (println (exec/print-program prog))))


(defn diesel [d expression]
  ;; the compile-time error path should come up through here
  ;; fix external number of regs
  (let [[form keys] (form-from-smil (smil/unpack d expression))
        res (fn [tuple]
              (condp = (exec/rget tuple exec/op-register)
                'insert (println "->" (exec/print-registers tuple))
                'flush  (println "|>" (exec/print-registers tuple))))
        prog (compiler/compile-dsl d @bag form)
        ec  (exec/open d prog res)]
    (pprint prog)
    (ec 'insert)
    (ec 'flush)))

(defn trace [d expression]
  ;; the compile-time error path should come up through here
  ;; fix external number of regs
  (let [[form keys] (form-from-smil (smil/unpack d (second expression)))
        res (fn [tuple]
              (condp = (exec/rget tuple exec/op-register)
                'insert (println "->" (exec/print-registers tuple))
                'flush  (println "|>" (exec/print-registers tuple))))
        _ (println form)
        prog (compiler/compile-dsl d @bag form)
        _ (pprint prog)
        ec (exec/open-trace d prog res)]
    (ec 'insert)
    (ec 'flush)))

;; xxx - this is now...in the language..not really?
(defn define [d expression]
  (let [z (smil/unpack d expression)]
    (db/insert-implication d (second z) (nth z 2) (rest (rest (rest z))) @user @bag)))


(declare read-all)

(defn eeval [d term]
  (let [function ({'define! define
                   'show show
                   'trace trace
                   'load read-all
                   } (first term))]
    (if (nil? function)
      (diesel d term)
      (function d term))
    d))

(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(defn read-all [d expression]
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
            (eeval d form)
            (recur)))))))
  

(defn rloop [d]
  (loop [d d]
    (doto *out* 
      (.write "eve> ")
      (.flush))
    ;; need to handle read errors, in particular eof
    
    ;; it would be nice if a newline on its own got us a new prompt
    (let [input (try
                  (read)
                  ;; we're-a-gonna assume that this was a graceful close
                  (catch Exception e 
                    (java.lang.System/exit 0)))]
      (when-not (= input 'exit)
        (recur (eeval d input))))))

