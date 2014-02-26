(ns aurora.compiler.graph
  (:require [clojure.walk :as walk]
            [clojure.set :as set]))

(defn find-refs [thing]
  (let [caps (atom [])]
    (walk/prewalk (fn [x]
                     (when (#{:ref/id :ref/js} (:type x))
                       (swap! caps conj x))
                     x)
                   thing)
    @caps))

(defn step->out [index page step]
  (let [id (:id step)]
    (reduce (fn [refs cur]
              (if (->> (find-refs @cur)
                       (filter #(= id (:id %)))
                       (seq))
                (conj refs cur)
                refs))
            []
            (map index (:steps page)))))

(defn page-graph [index page]
  (let [steps (:steps page)
        in (atom {})
        out (atom {})]
    (doseq [step steps
            :let [cur (index step)
                  refs (when cur (find-refs cur))
                  refs (when refs (set (filter identity (map :id refs))))]]
      (swap! in assoc step refs)
      (swap! out #(merge-with set/union % (zipmap refs (repeat #{step})))))
    {:in @in
     :out @out}))

;;TODO: this is like n^2
(defn graph->layers [graph]
  (let [all (->> (concat (keys (:in graph))
                         (keys (:out graph)))
                 (set))
        layers (atom (zipmap all (repeat 0)))
        final (atom (sorted-map))]
    (loop [cur @layers
           prev nil
           i 0]
      (when (and (not= prev cur)
                 (< i 10))
        (doseq [id all
                :let [my-layer (@layers id)]
                parent (-> graph :in (get id))]
          (when (>= (@layers parent) my-layer)
            (swap! layers assoc-in [id] (inc (@layers parent)))))
        (recur @layers cur (inc i))))
    (doseq [[id layer] @layers]
      (swap! final update-in [layer] set/union #{id})
      )
    [@final @layers]))
