(ns aurora.btree-test
  (:require [aurora.btree :refer [tree iterator least greatest compare-keys lt-fun gt-fun]]
            [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true]
            [cemerick.cljs.test :refer [run-all-tests]])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]
                   [cemerick.double-check.clojure-test :refer [defspec]]
                   ))

;; TESTS

(def gen-key
  (gen/one-of [gen/int gen/string-ascii]))

(def least-prop
  (prop/for-all [key gen-key]
                (and (lt least key) (lte least key) (gt key least) (gte key least))))

(def greatest-prop
  (prop/for-all [key gen-key]
                (and (gt greatest key) (gte greatest key) (lt key greatest) (lte key greatest))))

(def equality-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (== (== key-a key-b)
                    (and (lte key-a key-b) (not (lt key-a key-b)))
                    (and (gte key-a key-b) (not (gt key-a key-b))))))

(def reflexive-prop
  (prop/for-all [key gen-key]
                (and (lte key key) (gte key key) (not (lt key key)) (not (gt key key)))))

(def transitive-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key
                 key-c gen-key]
                (and (if (and (lt key-a key-b) (lt key-b key-c)) (lt key-a key-c) true)
                     (if (and (lte key-a key-b) (lte key-b key-c)) (lte key-a key-c) true)
                     (if (and (gt key-a key-b) (gt key-b key-c)) (gt key-a key-c) true)
                     (if (and (gte key-a key-b) (gte key-b key-c)) (gte key-a key-c) true))))

(def anti-symmetric-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (and (not (and (lt key-a key-b) (lt key-b key-a)))
                     (not (and (gt key-a key-b) (gt key-b key-a))))))

(def total-prop
  (prop/for-all [key-a gen-key
                 key-b gen-key]
                (and (or (lt key-a key-b) (gte key-a key-b))
                     (or (gt key-a key-b) (lte key-a key-b)))))

(def gen-assoc
  (gen/tuple (gen/return :assoc!) gen-key gen-key))

(def gen-dissoc
  (gen/tuple (gen/return :dissoc!) gen-key))

(def gen-action
  (gen/one-of [gen-assoc gen-dissoc]))

(defn apply-to-tree [tree actions]
  (doseq [action actions]
    (case (nth action 0)
      :assoc! (.assoc! tree (nth action 1) (nth action 2))
      :dissoc! (.dissoc! tree (nth action 1)))
    #_(do
        (prn action)
        (.pretty-print tree)
        (prn tree)
        (.valid! tree)))
  tree)

(defn apply-to-sorted-map [map actions]
  (reduce
   (fn [map action]
     (case (nth action 0)
       :assoc! (assoc map (nth action 1) (nth action 2))
       :dissoc! (dissoc map (nth action 1))))
   map actions))

(defn run-building-prop [min-keys actions]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)]
    (and (= (seq (map vec tree)) (seq sorted-map))
         (.valid! tree))))

(defn building-prop [gen]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen)]
                (run-building-prop min-keys actions)))

(defn run-lookup-prop [min-keys actions action]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)
        tree-result (case (nth action 0)
                      :assoc! (.assoc! tree (nth action 1) (nth action 2))
                      :dissoc! (.dissoc! tree (nth action 1)))
        sorted-map-result (contains? sorted-map (nth action 1))]
    (= tree-result sorted-map-result)))

(defn lookup-prop [gen]
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen)
                 action gen]
                (run-lookup-prop min-keys actions action)))

(def gen-next
  (gen/tuple (gen/return :next)))

(def gen-seek
  (gen/tuple (gen/return :seek) gen-key))

(def gen-movement
  (gen/one-of [gen-next gen-seek]))

(defn apply-to-iterator [iterator movements]
  (for [movement movements]
    (case (nth movement 0)
      :next (do
              (.next iterator)
              (.key iterator))
      :seek (do
              (.seek iterator (nth movement 1))
              (.key iterator)))))

(defn apply-to-elems [elems movements]
  (let [elems (atom (cons [least nil] elems))]
    (for [movement movements]
      (case (nth movement 0)
        :next (do
                (swap! elems rest)
                (first (first @elems)))
        :seek (do
                (swap! elems (fn [elems] (drop-while #(lt-fun (nth % 0) (nth movement 1)) elems)))
                (first (first @elems)))))))

(defn run-iterator-prop [min-keys actions movements]
  (let [tree (apply-to-tree (tree min-keys) actions)
        sorted-map (apply-to-sorted-map (sorted-map-by compare-keys) actions)
        iterator-results (apply-to-iterator (iterator tree) movements)
        elems-results (apply-to-elems (seq sorted-map) movements)]
    (= iterator-results elems-results)))

(def iterator-prop
  (prop/for-all [min-keys gen/s-pos-int
                 actions (gen/vector gen-action)
                 movements (gen/vector gen-movement)]
                (run-iterator-prop min-keys actions movements)))


(defspec least-prop-test
  1000
  least-prop)

(defspec greatest-prop-test
  1000
  greatest-prop)

(defspec equality-prop-test
  1000
  equality-prop)

(defspec reflexive-prop-test
  1000
  reflexive-prop)

(defspec transitive-prop-test
  1000
  transitive-prop)

(defspec anti-symmetric-prop-test
  1000
  anti-symmetric-prop)

(defspec total-prop-test
  1000
  total-prop)

(defspec assoc-test
  500
  (building-prop gen-assoc))

(defspec action-test
  500
  (building-prop gen-action))

(defspec lookup-action-test
  500
  (lookup-prop gen-action))

(defspec iterator-prop-test
  500
  iterator-prop)

(run-all-tests)
