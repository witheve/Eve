(ns server.log
  (:require [server.serialize :as serialize]
            [server.edb :as edb]
            [server.db :as db]
            [clojure.java.io :as io]
            [clojure.string :as string])
  (:import [java.io File]
           [java.lang Long]))


(defn filename-from-bag [p bag-id]
  (str p "/"
       (format "%x" (:time bag-id)) "-"
       (format "%x" (:batch bag-id)) "-"
       (format "%x" (:machine bag-id))))

(defn bags [p]
  (let [d (File. p)]
    (println "wtf" (map str (.listFiles d)))
    (map (fn [f]
           (let [terms (string/split (.getName f) #"-")]
             (println "filo" terms)
             (apply db/wrapoid (map (fn [x] (Long/parseLong x 16)) terms))))
         (.listFiles d))))


;; slurp up the whole thing...we should only be doing this
;; on startup, which means that no one should be writing this thing
(defn scan [p bag-id]
  (let [f (File. (filename-from-bag p bag-id))
        len (.length f)
        target (byte-array  len)
        ;; seems odd that this operates on the filename
        s (java.io.FileInputStream. f)]

    (.read s target)
    (.close s)
    ;; there are two ways this can go, internal import or just bulk export
    ;; also decode expects an object, not a concatenation of objects, which
    ;; is what we want in this case
    (serialize/decode-five-tuples target 0 len
                                  (fn [x] (println "i wanna be inserted" x)))))

(defn delete [p bag-id]
    (io/delete-file (filename-from-bag p bag-id)))

(defn open [db path bag-id]
  ;; we should create this on the first write, so that the
  ;; log timestamp indicates the beginning of the record, and
  ;; not some arbitrary point before that
  (let [f (clojure.java.io/file (filename-from-bag path bag-id))]
    (when (not (.exists f)) (.createNewFile f))
    (let [w (clojure.java.io/output-stream f :append true)]
      ;; shouldn't have to create a view?
      (edb/add-listener (edb/create-view db bag-id 0)
                        (gensym "log")
                        (fn [op x k]
                          (when (= op 'insert)
                            (let [enc (serialize/encode-five-tuples [x])]
                              (println "enc" (seq enc) (filename-from-bag path bag-id) w)
                              (.write w enc)
                              (.flush w))))))))


