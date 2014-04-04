(aset js/aurora.language "representation" nil)

(ns aurora.language.representation
  (:require-macros [aurora.macros :refer [set!! conj!! disj!! assoc!!]]))

;; SCHEMAS

(defrecord Schema [name authority key->valid?]) ;; authority is :essential or :derived

;; KNOWLEDGE

(defrecord Knowledge [pretended asserted retracted now name->schema])

(defn name? [x]
  (or (string? x) (keyword? x)))

(defn pred-name [fact|pattern]
  (cond
   (and (map? fact|pattern) (name? (:name fact|pattern))) (:name fact|pattern)
   (and (vector? fact|pattern) (name? (first fact|pattern))) (first fact|pattern)
   :else ::any))

(defn by-pred-name [kn]
  (group-by pred-name (concat (:now kn) (:pretended kn))))

(defn with-schemas [kn schemas]
  (assoc-in kn [:name->schema] (zipmap (map :name schemas) schemas)))

(defn check-facts [name->schema authority facts]
  (doseq [fact facts]
    (when-let [schema (get name->schema (pred-name fact))]
      ;; TODO (assert schema)
      (assert (= authority (:authority schema)) (pr-str fact (:authority schema)))
      (doseq [[key valid?] (:key->valid? schema)]
        (assert (valid? (get fact key)) (pr-str fact key valid?))))))

(defn pretend-facts [kn facts]
  (check-facts (:name->schema kn) :derived facts)
  (update-in kn [:pretended] into facts))

(defn assert-facts [kn facts]
  (check-facts (:name->schema kn) :essential facts)
  (update-in kn [:asserted] into facts))

(defn retract-facts [kn facts]
  (check-facts (:name->schema kn) :essential facts)
  (update-in kn [:retracted] into facts))

(defn tick [kn]
  (let [now (:now kn)
        next (transient (:now kn))
        asserted (:asserted kn)
        retracted (:retracted kn)
        name->schema (:name->schema kn)]
    (doseq [fact asserted]
      (when (or (contains? now fact) (not (contains? retracted fact)))
        (conj!! next fact)))
    (doseq [fact retracted]
      (when (or (not (contains? now fact)) (not (contains? asserted fact)))
        (disj!! next fact)))
    (->Knowledge #{} #{} #{} (persistent! next) name->schema)))

(comment
  (-> (->Knowledge #{} #{} #{} #{:a})
      (assert-facts [:a :b :c])
      (retract-facts [:a :b :d])
      tick)

  (-> (->Knowledge #{} #{} #{} #{:a})
      (with-schemas [(->Schema :foo :essential {1 keyword? 2 string?})])
      (assert-facts [[:foo :bar "baz"]])
      tick)

  (-> (->Knowledge #{} #{} #{} #{:a})
      (with-schemas [(->Schema :foo :essential {1 keyword? 2 string?})])
      (assert-facts [[:foo :bar :baz]])
      tick)

  (-> (->Knowledge #{} #{} #{} #{:a})
      (with-schemas [(->Schema :foo :essential {1 keyword? 2 string?})])
      (pretend-facts [[:foo :bar "baz"]])
      tick)
  )
