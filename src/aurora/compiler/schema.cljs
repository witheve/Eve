(ns aurora.compiler.schema
  (:require [aurora.compiler.datalog :refer [has knowledge]])
  (:require-macros [aurora.compiler.datalog :refer [q*]]))

;; TODO errors should really be (new-id) ::error _

;; tests

(defrecord Error [message])

(defn error [message & ks&vs]
  (apply assoc (->Error message) ks&vs))

(defn all [& tests]
  (fn [kn x]
    (apply concat (for [test tests] (test kn x)))))

(defn is! [test]
  (fn [kn x]
    (when-not (test x)
      [(error "Failed test" :x x :test test)])))

(defn has! [& as]
  (fn [kn x]
    (for [a as
          :when (not (seq (has kn x a)))]
      (error "Value is missing attribute" :x x :missing-a a))))

(defn id? [id]
  (keyword? id))

(defn id! [& as]
  (all (is! id?) (apply has! as)))

(def true!
  (is! true?))

(def text!
  (is! string?))

(def number!
  (is! number?))

(defn vector! [elem!]
  (fn [kn x]
    (if-not (vector? x)
      [(error "Not a vector" :x x)]
      (apply concat (for [elem x] (elem! kn elem))))))

(defn map! [key! val!]
  (fn [kn x]
    (if-not (map? x)
      [(error "Not a map" :x x)]
      (concat
       (apply concat (for [key (keys x)] (key! kn key)))
       (apply concat (for [val (vals x)] (val! kn val)))))))

(defn ids! [& as]
  (vector! (apply id! as)))

;; schemas

(defn errors [kn]
  (q* kn
      [_ ::error ?error]
      :return
      error))

(defn has-many [a v!]
  (fn [knowledge]
    (for [[e vs] (get-in knowledge [:a->e->vs a])
          v vs
          error (v! knowledge v)]
      [e ::error (assoc error :e e :a a :v v)])))

(defn has-one [a v!]
  (fn [knowledge]
    (concat
     (for [[e vs] (get-in knowledge [:a->e->vs a])
           :when (> (count vs) 1)]
       [e ::error (error "Too many values" :e e :a a :vs vs)])
     ((has-many a v!) knowledge))))

(defn group [name & as]
  (fn [knowledge]
    (for [[e a->vs] (:e->a->vs knowledge)
          :when (some #(seq (get a->vs %)) as)]
      [e name true])))

(defn required [name & as]
  (fn [knowledge]
    (for [[e a->vs] (:e->a->vs knowledge)
          :let [found-as (filter #(seq (get a->vs %)) as)
                missing-as (filter #(empty? (get a->vs %)) as)]
          :when (seq found-as)]
      (if (empty? missing-as)
        [e name true]
        [e ::error (error "Missing required attributes" :e e :group name :found-as found-as :missing-as missing-as)]))))

;; TODO exclusive can potentially be extensible if split into group and exclusive
(defn exclusive [name & as]
  (fn [knowledge]
    (for [[e a->vs] (:e->a->vs knowledge)
          :let [found-as (filter #(seq (get a->vs %)) as)]
          :when (seq found-as)]
      (if (<= (count found-as) 1)
        [e name true]
        [e ::error (error "Clash between attributes" :e e :group name :found-as found-as)]))))

;; tests


(comment
  (errors (knowledge #{[:jamie :person/age 27] [:jamie :person/height 11]} [[(has-one :person/age number!)]]))

  (errors (knowledge #{[:jamie :person/age "27"] [:jamie :person/height 11]} [[(has-one :person/age number!)]]))

  (errors (knowledge #{[:jamie :person/age 27] [:jamie :person/age 11]} [[(has-one :person/age number!)]]))

  (errors (knowledge #{[:jamie :employee/boss :chris] [:chris :employee true]} [[(has-one :employee/boss (id! :employee))]]))

  (errors (knowledge #{[:jamie :employee/boss {:name :chris}] [:chris :employee true]} [[(has-one :employee/boss (map! (is! keyword?) (id! :employee)))]]))

  (errors (knowledge #{[:jamie :employee/boss {:name :santa}] [:chris :employee true]} [[(has-one :employee/boss (map! (is! keyword?) (id! :employee)))]]))

  (errors (knowledge #{[:jamie :employee/boss :chris] [:chris :employee true]} [[(has-one :employee/boss (map! (is! keyword?) (id! :employee)))]]))

  (errors (knowledge #{[:jamie :employee/boss :chris]} [[(has-one :employee/boss (id! :employee))]]))

  (errors (knowledge #{[:jamie :employee/boss :santa] [:chris :employee true]} [[(has-one :employee/boss (id! :employee))]]))

  (errors (knowledge #{[:jamie :person/age 27] [:jamie :person/height 11]} [[(required :person :person/age :person/height)]]))

  (errors (knowledge #{[:jamie :person/height 11]} [[(required :person :person/age :person/height)]]))

  (errors (knowledge #{[:jamie :person/age 27] ["isbn123" :book/title "Return of the King"]} [[(exclusive :kind :person/age :book/title)]]))

  (errors (knowledge #{[:jamie :person/age 27] [:jamie :book/title "Return of the King"]} [[(exclusive :kind :person/age :book/title)]])))
