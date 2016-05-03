(ns server.repl
  (:require [server.db :as db]
            [server.edb :as edb]
            [server.log :as log]
            [server.smil :as smil]
            [server.compiler :as compiler]
            [server.serialize :as serialize]
            [clojure.pprint :refer [pprint]]
            [server.exec :as exec]))

(declare eeval)

(defn repl-error [& thingy]
  (throw thingy))

(defn form-from-smil [z] [z (second z)])

(defn show [d expression]
  (let [[form keys] (form-from-smil (smil/unpack d (second expression)))
        prog (compiler/compile-dsl d form)]
     (pprint prog)))


(defn print-result [keys channel tick]
  (fn [tuple]
    (condp = (exec/rget tuple exec/op-register)
                'insert (println "INSERT" channel (exec/print-registers tuple))
                'remove (println "REMOVE" channel (exec/print-registers tuple))
                'flush  (println "FLUSH " channel (exec/print-registers tuple))
                'close  (println "CLOSE " channel (exec/print-registers tuple) (float (/ (- (System/nanoTime) tick) 1000000000)))
                'error  (println "ERROR " channel (exec/print-registers tuple)))))

(declare define)
(defn execco [d expression trace-on channel]
  (let [[forms keys] (form-from-smil (smil/unpack d expression))
        forms (if-not (vector? forms) [forms] forms)
        _ (when trace-on
            (println "--- SMIL ---")
            (pprint forms)
            (println " --- Program / Trace ---"))

        progs (map #(if (= (first %1) 'define!)
                      (define d %1 trace-on)
                      (compiler/compile-dsl d %1)) forms)
        start (System/nanoTime)
        ecs (doall (map #(exec/open d %1 (print-result keys channel start)
                                    (if trace-on
                                      (fn [n m x] (fn [r] (println "trace" n m) (println (exec/print-registers r)) (x r)))
                                      (fn [n m x] x))) progs))]

    (when trace-on (pprint progs))
    (doseq [ec ecs]
      (ec 'insert)
      (ec 'flush)
      ec)))

(defn diesel [d expression trace-on]
  (doseq [ec (execco d expression trace-on "")]
    (ec 'close)
    ec))

(defn open [d expression trace-on]
  (execco d (nth expression 2) trace-on (second expression)))

(defn timeo [d expression trace-on]
  (let [[form keys] (form-from-smil (smil/unpack d (nth expression 1)))
        counts []
        prog (compiler/compile-dsl d form)
        start (System/nanoTime)
        res (print-result keys (second expression) start)
        ec (exec/open d prog res (fn [n m x] (println "here" m) x))]
    (when trace-on (pprint prog))
    (ec 'insert)
    (ec 'flush)))


(defn doexit [d expression trace-on]
  (System/exit 0))

(defn trace [d expression trace-on]
  (eeval d (second expression) true))

;; xxx - this is now...in the language..not really?
(defn define [d expression trace-on]
  (let [z (smil/unpack d expression)]
    (db/insert-implication d (second z) (nth z 2) (rest (rest (rest z))))))


(defn dodot [d expression trace-on]
  (let [[form keys] (form-from-smil (smil/unpack d (second expression)))
        program (compiler/compile-dsl d form)]
    (println (str  "digraph query {\n"
                   (apply str
                          (map (fn [x]
                                 (let [block (nth x 1)]
                                   (apply str (map #(if (= (first %1) 'send)
                                                      (str "\"" block "\" -> \"" (second %1) "\"\n") "") (nth x 2)))))
                               program))
                   "}\n"))))


(defn create-bag [d expression trace-on]
  (println "i wish i could help you"))


(declare read-all)

(defn eeval
  ([d term] (eeval d term false))
  ([d term trace-on]
     (let [function ({'show show
                      'trace trace
                      'create-bag create-bag
                      'time timeo
                      'exit doexit
                      'dot dodot
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


(defn rloop [d trace-on]
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
      (recur
       (try (eeval d input)
            (catch Exception e
              (println "error" e)))))))
