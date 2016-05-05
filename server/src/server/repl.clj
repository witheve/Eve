(ns server.repl
  (:import [java.io PushbackReader])
  (:require [clojure.java.io :as io]
            [server.db :as db]
            [server.edb :as edb]
            [server.log :as log]
            [server.smil :as smil]
            [server.compiler :as compiler]
            [server.serialize :as serialize]
            [clojure.pprint :refer [pprint]]
            [server.exec :as exec]))

(defn time-elapsed [start]
  (float (/ (- (System/nanoTime) start) 1000000000)))

(defn print-diff-callback [channel form op & [results]]
  (condp = op
    'flush (let [{inserts 'insert removes 'remove} (group-by #(get %1 0) results)]
             (println "--- FLUSH" channel "---")
             (println (smil/get-fields form))
             (println "INSERT:")
             (doseq [insert inserts]
               (println (clojure.string/join " " (drop 2 insert))))
             (println "REMOVE:")
             (doseq [remove removes]
               (println (clojure.string/join " " (drop 2 remove)))))
    'close (println "--- FLUSH" channel "---")
    'error (do (println "--- ERROR" channel "---")
               (println results))))

(defn print-result-handler [channel]
  (let [tick (System/nanoTime)]
    (fn [form]
      (fn [tuple]
        (condp = (exec/rget tuple exec/op-register)
          'insert (println "INSERT" channel (exec/print-registers tuple))
          'remove (println "REMOVE" channel (exec/print-registers tuple))
          'flush  (println "FLUSH " channel (exec/print-registers tuple))
          'close  (do
                    (println (exec/print-registers tuple))
                    (println (str "--- CLOSE [" (time-elapsed tick) "ms]") channel "---"))
          'error  (println "ERROR " channel (exec/print-registers tuple)))))))

(defn buffered-result-handler [channel callback]
  (fn [form]
    (let [results (atom ())
          fields (smil/get-fields form)
          store-width (+ (count fields) 2)] ;; [op qid & results]
      (fn [tuple]
        (condp = (exec/rget tuple exec/op-register)
          'insert (swap! results conj (vec (take store-width tuple)))
          'remove (swap! results conj (vec (take store-width tuple)))
          'flush (do (callback channel form 'flush @results)
                     (reset! results '()))
          'close (callback channel form 'close)
          'error (callback channel form 'error (ex-info "Failure to WEASL" {:data (str tuple)})))))))

(defn define [db form trace-on]
  (db/insert-implication db
                         (second form)
                         (nth form 2)
                         (drop 3 form))
  nil)

(defn compile-forms [db forms trace]
  (reduce (fn [progs form]
            (assoc progs form
                   (if (= (first form) 'define!)
                     (define db form (:compiling trace))
                     (compiler/compile-dsl db form))))
          {} forms))

(defn as-executable
  ([db progs handler] (as-executable progs handler false))
  ([db progs handler tracer]
   (let [tracer (if (and tracer (not (fn? tracer)))
                  (fn [n m x] (fn [r] (println "trace" n m) (println (exec/print-registers r)) (x r)))
                  (or tracer (fn [n m x] x)))
         ;runnables (filter identity (vals progs))
         runnables (select-keys progs (for [[k v] progs :when v] k))
         exes (doall (map #(exec/open db (second %1) (handler (first %1)) tracer) runnables))]
     (fn [& args]
       (doseq [exe exes]
         (apply exe args))))))

(defn exec*
  ([db expression handler] (exec* db expression handler false))
  ([db expression handler trace]
   (let [trace (if (= trace true)
                 #{:expanded :compiled :executing}
                 (or trace #{}))
         start (System/nanoTime)
         forms (smil/unpack db expression)]
     (when (:expanded trace)
       (println (str "--- SMIL (:expanded) [" (time-elapsed start) "ms] ---"))
       (smil/print-smil forms))

     (let [start (System/nanoTime)
           progs (compile-forms db forms trace)]
       (when (:compiled trace)
         (println (str "--- WEASL (:compiled) [" (time-elapsed start) "ms] ---"))
         (pprint (vals progs)))

       (let [exe (as-executable db progs handler (:executing trace))]
         (when (:executing trace)
           (println "--- TRACE (:executing) ---"))
         (exe 'insert)
         (exe 'flush)
         (with-meta exe {:raw expression
                         :smil (vec forms)
                         :weasl (vec (vals progs))
                         :define-only (not= (count progs) (count (filter identity (vals progs))))}))))))

(defn exec-once [db expression trace]
  (let [exe (exec* db expression (print-result-handler (gensym "eval")) trace)]
    (exe 'close)
    exe))

(defn exec-open [db expression trace]
  (exec* db (nth expression 2) (print-result-handler (second expression)) trace))

(defn exec-buffered [db expression trace]
  (let [exe (exec* db (nth expression 2) (buffered-result-handler (second expression) print-diff-callback) trace)]
    (exe 'close)
    exe))

(defn exec-open-buffered [db expression trace]
  (exec* db (nth expression 2) (buffered-result-handler (second expression) print-diff-callback) trace))

(defn doexit [d expression trace-on]
  (System/exit 0))

(defn dodot [d expression trace-on]
  (let [forms (smil/unpack d (second expression))
        progs (compile-forms forms trace-on)]
    ;; @FIXME: THIS IS PROBABLY NOT THE RIGHT WAY TO DO THIS
    (doseq [program (vals progs)]
      (println (str  "digraph query {\n"
                     (apply str
                            (map (fn [x]
                                   (let [block (nth x 1)]
                                     (apply str (map #(if (= (first %1) 'send)
                                                        (str "\"" block "\" -> \"" (second %1) "\"\n") "") (nth x 2)))))
                                 program))
                     "}\n")))))


(defn create-bag [d expression trace-on]
  (println "i wish i could help you"))

(declare eeval)
(defn trace [db expression trace-on]
  (if (or (set? (second expression)) (vector? (second expression)))
    (eeval db (nth expression 2) (set (second expression)))
    (eeval db (second expression) true)))

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

(defn eeval
  ([d term] (eeval d term false))
  ([d term trace-on]
     (let [function ({'trace trace
                      'create-bag create-bag
                      'exit doexit
                      'dot dodot
                      'open exec-open
                      'buffer exec-buffered
                      'open-buffer exec-open-buffered
                      'load read-all
                      } (first term))]
       (if (nil? function)
         (exec-once d term trace-on)
         (function d term trace-on))
       d)))

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
