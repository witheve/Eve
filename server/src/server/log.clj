(ns server.log
  (:require [server.serialize :as serialize]
            [server.edb :as edb]
            [server.db :as db]))

(require '[clojure.java.io :as io])
(import java.io.File)

(def store-pathname (atom "."))

(defn set-pathname [p]
  (swap! store-pathname (fn [x] p)))

(defn log-files []
  (let [d (File. store-pathname)]
    (doseq [f (.listFiles d)]
      ; parse the filename into a vt
      (println "filo" (.getName f)))))

;; slurp up the whole thing...we should only be doing this
;; on startup, which means that no one should be writing this thing
(defn read-log [f]
  (let [filename (str store-pathname f)
        f (File. filename)
        target (byte-array  (.length f))
        ;; seems odd that this operates on the filename
        s (java.io.FileInputStream. f)]
    (.read s target)
    (.close s)
    ;; there are two ways this can go, internal import or just bulk export
    ;; also decode expects an object, not a concatenation of objects, which
    ;; is what we want in this case
    (serialize/decode target 0 (.length f))))

(defn delete-log [f]
  (let [filename (str store-pathname f)]
    (io/delete-file filename)))

;; just a global log right now, lets not think about relation oid
(defn open-log []
  (let [p (str @store-pathname "log" (db/now))]
    ;; we should create this on the first write, so that the
    ;; log timestamp indicates the beginning of the record, and
    ;; not some arbitrary point before that
    (with-open [w (clojure.java.io/output-stream (str p "/planet"))]
      ;; keep track of the written length and rotate the log
      (fn [x] (.write w (serialize/encode x))))))

