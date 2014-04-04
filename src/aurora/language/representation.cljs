(aset js/aurora.language "representation" nil)

(ns aurora.language.representation
  (:require-macros [aurora.macros :refer [set!! conj!! disj!! assoc!!]]))

;; KNOWLEDGE

(defrecord Knowledge [pretended asserted retracted now])

(defn pretend-facts [kn facts]
  (update-in kn [:pretended] into facts))

(defn assert-facts [kn facts]
  (update-in kn [:asserted] into facts))

(defn retract-facts [kn facts]
  (update-in kn [:retracted] into facts))

(defn tick [kn]
  (let [now (:now kn)
        next (transient (:now kn))
        asserted (:asserted kn)
        retracted (:retracted kn)]
    (doseq [fact asserted]
      (when (or (contains? now fact) (not (contains? retracted fact)))
        (conj!! next fact)))
    (doseq [fact retracted]
      (when (or (not (contains? now fact)) (not (contains? asserted fact)))
        (disj!! next fact)))
    (->Knowledge #{} #{} #{} (persistent! next))))

(defn name? [x]
  (or (string? x) (keyword? x)))

(defn pred-name [fact|pattern]
  (cond
   (and (map? fact|pattern) (name? (:name fact|pattern))) (:name fact|pattern)
   (and (vector? fact|pattern) (name? (first fact|pattern))) (first fact|pattern)
   :else ::any))

(defn by-pred-name [kn]
  (group-by pred-name (concat (:now kn) (:pretended kn))))

(comment
  (-> (->Knowledge #{} #{} #{} #{:a})
      (assert-facts [:a :b :c])
      (retract-facts [:a :b :d])
      tick)
  )

;; SCHEMAS

(defrecord Schema [name authority]) ;; authority is :state or :view
