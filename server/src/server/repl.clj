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
     (pprint prog)))


(defn print-result [keys channel tick]
  (fn [tuple]
    (condp = (exec/rget tuple exec/op-register)
                'insert (println "INSERT" channel (exec/print-registers tuple))
                'remove (println "REMOVE" channel (exec/print-registers tuple))
                'flush  (println "FLUSH " channel (exec/print-registers tuple))
                'close  (println "CLOSE " channel (exec/print-registers tuple) (float (/ (- (System/nanoTime) tick) 1000000000)))
                'error  (println "ERROR " channel (exec/print-registers tuple)))))

(defn diesel [d expression trace-on]
  (let [[form keys] (form-from-smil (smil/unpack d expression))
        _ (when trace-on
            (println "--- SMIL ---")
            (pprint form)
            (println " --- Program / Trace ---"))
        prog (compiler/compile-dsl d @bag form)
        start (System/nanoTime)
        ec (exec/open d prog (print-result keys "" start)
                      (if trace-on
                        (fn [n m x] (fn [r] (println "trace" n m) (println (exec/print-registers r)) (x r)))
                        (fn [n m x] x)))]

    (when trace-on (pprint prog))
    (ec 'insert)
    (ec 'flush)
    (ec 'close)))

(defn open [d expression trace-on]
  (println "open" expression)
  (let [[form keys] (form-from-smil (smil/unpack d (nth expression 2)))
        prog (compiler/compile-dsl d @bag form)
        start (System/nanoTime)
        res (print-result keys (second expression) start)
        tf (if trace-on
             (fn [n m x] (fn [r] (println "trace" n m) (println (exec/print-registers r)) (x r)))
             (fn [n m x] x))
        ec (exec/open d prog res tf)]
    (when trace-on (pprint prog))
    (ec 'insert)
    (ec 'flush)))

(defn timeo [d expression trace-on]
  (println "open" expression)
  (let [[form keys] (form-from-smil (smil/unpack d (nth expression 1)))
        counts []
        prog (compiler/compile-dsl d @bag form)
        start (System/nanoTime)
        res (print-result keys (second expression) start)
        ec (exec/open d prog res (fn [n m x] (println "here" m) x))]
    (when trace-on (pprint prog))
    (ec 'insert)
    (ec 'flush)))


(defn trace [d expression trace-on]
  (diesel d (second expression) true))

;; xxx - this is now...in the language..not really?
(defn define [d expression trace-on]
  (let [z (smil/unpack d expression)]
    (db/insert-implication d (second z) (nth z 2) (rest (rest (rest z))) @user @bag)))


(declare read-all)

(defn eeval
  ([d term] (eeval d term false))
  ([d term trace-on]
     (let [function ({'define! define
                      'show show
                      'trace trace
                      'time timeo
                      'open open
                      'load read-all
                      } (first term))]
       (if (nil? function)
         (diesel d term trace-on)
         (function d term trace-on))
       d)))

(import '[java.io PushbackReader])
(require '[clojure.java.io :as io])

(defn read-all [d expression trace-on]
  ;; trap file not found
  ;; need to implement load path here!

  (let [filename (second expression)
        rdr (try (-> (.getPath (clojure.java.io/resource filename)) io/file io/reader PushbackReader.)
                 (catch Exception e (-> filename io/file io/reader PushbackReader.)))]

    (loop []
      ;; terrible people, always throw an error, even on an eof, so cant print read errors? (println "load parse error" e)
      (let [form (try (smil/read rdr)
                      (catch RuntimeException eof ())
                      (catch Exception e (println "badness 10000" e)))]
        (if (and form (not (empty? form)))
          (do
            (eeval d form trace-on)
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
        (recur
         (try (eeval d input)
              (catch Exception e
                (println "error" e))))))))
