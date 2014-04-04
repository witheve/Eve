(aset js/aurora.language "representation" nil)

(ns aurora.language.representation
  (:require-macros [aurora.macros :refer [set!! conj!! disj!! assoc!!]]))

;; KNOWLEDGE

(defrecord Knowledge [prev asserted-now retracted-now now])

(defn tick [{:keys [now]}]
  (->Knowledge now #{} #{} now))

(defn assert-facts [kn facts]
  (let [prev (:prev kn)
        now (transient (:now kn))
        asserted-now (transient (:asserted-now kn))
        retracted-now (:retracted-now kn)]
    (doseq [fact facts]
      (conj!! asserted-now fact)
      (when (or (contains? prev fact) (not (contains? retracted-now fact)))
        (conj!! now fact)))
    (->Knowledge prev (persistent! asserted-now) retracted-now (persistent! now))))

(defn retract-facts [kn facts]
  (let [prev (:prev kn)
        now (transient (:now kn))
        asserted-now  (:asserted-now kn)
        retracted-now (transient (:retracted-now kn))]
    (doseq [fact facts]
      (conj!! retracted-now fact)
      (when (or (not (contains? prev fact)) (not (contains? asserted-now fact)))
        (disj!! now fact)))
    (->Knowledge prev asserted-now (persistent! retracted-now) (persistent! now))))

(defn name? [x]
  (or (string? x) (keyword? x)))

(defn pred-name [fact|pattern]
  (cond
   (and (map? fact|pattern) (name? (:name fact|pattern))) (:name fact|pattern)
   (and (vector? fact|pattern) (name? (first fact|pattern))) (first fact|pattern)
   :else ::any))

(defn by-pred-name [kn]
  (group-by pred-name (:now kn)))

(comment
  (-> (->Knowledge #{:a} #{} #{} #{})
      (assert-facts [:a :b :c])
      (retract-facts [:a :b :d]))
  )
