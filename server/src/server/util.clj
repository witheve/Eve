(ns server.util)

(defn partition-2 [pred coll]
  ((juxt
    (partial filter pred)
    (partial filter (complement pred)))
   coll))

(defn merge-state [a b]
  (if (map? a)
    (merge-with merge-state a b)
    (if (coll? a)
      (into a b)
      b)))
