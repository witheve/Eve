(ns aurora.core
  (:require [clojure.walk :as walk]
            [aurora.keyboard :as kb]
            [dommy.core :as dommy]
            [dommy.utils :as utils]
            [cljs.reader :as reader]
            [clojure.string :as string]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel1 sel]]
                   [aurora.macros :refer [with-path dovec]]
                   [cljs.core.async.macros :refer [go]]))

(enable-console-print!)

(def channel chan)
(defn take []
  (let [r (vec (js/Array.prototype.slice.call (js* "arguments")))
        [combine? r] (if (coll? (first r))
                       [false (concat (first r) [(last r)])]
                       [true r])
        total (dec (count r))
         counter (atom total)
         results (atom {})
         func (last r)]
     (doseq [[i c] (map-indexed vector (butlast r))]
       (take! c
              (fn [v]
                (swap! results assoc i v)
                (swap! counter dec)
                (when (= @counter 0)
                  (if combine?
                    (apply func (mapv @results (range total)))
                    (func (mapv @results (range total)))))
                )))))

(def put put!)

(def caps (js-obj))

(defn capture [ns func x]
  (let [name (str ns "." func)
        cur (last (aget caps name))]
    (when cur
      (.push (aget cur "steps") x))
    x))

(defn scope [ns func scp]
  (let [name (str ns "." func)
        cur (or (aget caps name) (aset caps name (array)))]
    (when cur
      (.push cur (js-obj
                  "ns" ns
                  "func" func
                  "scope" scp
                  "steps" (array))))))

(defn safe-aget [arr k]
  (when arr
    (aget arr k)))

(defn ->scope
  ([ns func] (->scope ns func 0))
  ([ns func iter]
   (let [name (str ns "." func)
         cur (aget caps name)]
     (-> (safe-aget caps name)
         (safe-aget iter)
         (safe-aget "scope")))))

(defn ->capture
  ([ns func step] (->capture ns func step 0))
  ([ns func step iter]
   (let [name (str ns "." func)]
     (-> (safe-aget caps name)
         (safe-aget iter)
         (safe-aget "steps")
         (safe-aget step)))))

(defn alist [arr]
  (vec arr))

(defn each [x y]
  (with-meta
    (mapv y x)
    (meta x)))

(defn isTable [thing]
  (-> thing meta (get ::table)))

(def isList vector?)

(defn gett [thing ks]
  (if (and (isTable thing)
           (string? (first ks)))
    (get-in thing (concat 0 ks))
    (get-in thing ks)))

(def isEmpty empty?)

(set! aurora.math (js-obj))
(set! aurora.math.even even?)

;;;core ops

(defn meta-preserving-map [f coll]
  (with-meta (map f coll) (meta coll)))

(defn update-columns [table row]
  (let [row (transient row)]
    (-> (reduce (fn [res [k v]]
                  (assoc! res k (v res)))
                row
                (-> table meta ::columns))
        (persistent!))))

(defn meta-preserving-vec [coll]
  (with-meta (vec coll) (meta coll)))

;;table
(defn table [cols vals]
  (let [tbl [(zipmap cols (or vals (repeat nil)))]]
    (alter-meta! tbl assoc ::table true ::columns [])
    tbl))

;;set cell

;;each row
;;each column
;;add column
(defn add-column [table col v]
  (let [v (if (fn? v)
            (memoize v)
            (constantly v))
        tbl (meta-preserving-map #(assoc % col (v %)) table)]
    (alter-meta! tbl update-in [::columns] conj [col v])
    tbl))

;;add row
(defn add-row [table vals]
  (let [row (zipmap (-> table first keys) (or vals (repeat nil)))]
    (if (vector? table)
      (conj table (update-columns table row))
      (conj (meta-preserving-vec table) (update-columns table row)))))

(defn set-row [table row-num vs]
  (assoc table row-num (update-columns table vs)))

;;sort rows
(defn sort-rows [table by dir]
  (if (fn? by)
    (sort-by by dir table)
    (sort-by #(get % by) dir table)))
;;group rows?
;;match rows

(defn column [table col]
  (with-meta (map #(get % col) table) {::column-name col}))

(comment
  (-> (table ["foo" "bar"] [3 4])
      (add-column "woot" #(+ (get % "foo") (get % "bar")))
      (add-row [6 8])
      (add-row [234 34])
      (set-row 1 {"foo" 1 "bar" 10})
      (sort-rows "woot" <)
      (column "woot")
      )
  )

;;list
;;add item
;;match item
;;each item
;;sort items
;;group items

;;numbers
;;math?

;;strings
;;concat
;;interpolate?
;;substring
;;split
;;replace
;;find
;;to list


;; core transformers

;;HTML
;;math
;;net