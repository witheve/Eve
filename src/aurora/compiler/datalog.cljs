(ns aurora.compiler.datalog
  (:require clojure.set
            aurora.compiler.match)
  (:require-macros [aurora.macros :refer [check deftraced]]
                   [aurora.compiler.match :refer [match]]
                   [aurora.compiler.datalog :refer [rule defrule q* q? q!]]))

;; TODO naming is inconsistent

(defrecord Knowledge [axiom-eavs cache-eavs e->a->vs a->e->vs rules])

(defn add-eav
  ([knowledge eav]
   (add-eav knowledge eav true))
  ([knowledge eav axiom?]
   (let [[e a v] eav
         vs (conj (get-in knowledge [:e->a->vs e a] #{}) v)
         knowledge (-> knowledge
                       (update-in [:cache-eavs] conj eav)
                       (assoc-in [:e->a->vs e a] vs)
                       (assoc-in [:a->e->vs a e] vs))]
     (if axiom?
       (update-in knowledge [:axiom-eavs] conj eav)
       knowledge))))

(defn fixpoint
  ([knowledge rules]
   (let [new-knowledge (reduce
                        (fn [knowledge rule]
                          (reduce #(add-eav %1 %2 false) knowledge (rule knowledge)))
                        knowledge
                        rules)]
     (if (not= knowledge new-knowledge)
       (recur new-knowledge rules)
       knowledge)))
  ([knowledge]
   (reduce fixpoint knowledge (:rules knowledge))))

(defn knowledge [facts rules]
  (fixpoint (reduce add-eav (Knowledge. #{} #{} {} {} rules) facts)))

(defn know [knowledge & facts]
  (fixpoint (reduce add-eav knowledge facts)))

(defn unknow [knowledge & facts]
  (let [new-facts (clojure.set/difference (:axiom-eavs knowledge) facts)]
    (fixpoint (reduce add-eav (Knowledge. #{} #{} {} {} (:rules knowledge)) facts))))

;; TODO needs auto stratification
#_(defn learn [knowledge & rules]
    (fixpoint (reduce #(update-in %1 [:rules] conj %2) knowledge rules)))

(defn has
  ([kn e]
   (get-in kn [:e->a->vs e]))
  ([kn e a]
   (get-in kn [:e->a->vs e a]))
  ([kn e a v]
   (get-in kn [:e->a->vs e a v])))

;; tests

((rule
  [?x ?relates ?z]
  [?y ?relates ?z]
  (not= x y)
  :return
  [x :likes y]
  [y :likes x])
 (knowledge
  #{[:jamie :likes :datalog]
    [:jamie :likes :types]
    [:jamie :hates :types]
    [:chris :likes :datalog]
    [:chris :hates :types]}
  []))

((rule
  [?x :likes ?z]
  [?y :hates ?z]
  (not= x y)
  :return
  [x :hates y])
 (knowledge
  #{[:jamie :likes :datalog]
    [:jamie :likes :types]
    [:jamie :hates :types]
    [:chris :likes :datalog]
    [:chris :hates :types]}
  []))

(def marmite
  (knowledge
   #{[:jamie :likes :datalog]
     [:jamie :likes :types]
     [:jamie :hates :types]
     [:chris :likes :datalog]
     [:chris :hates :types]}
   [[(rule
      [?x ?relates ?z]
      [?y ?relates ?z]
      (not= x y)
      :return
      [x :likes y]
      [y :likes x])
     (rule
      [?x :likes ?z]
      [?y :hates ?z]
      (not= x y)
      :return
      [x :hates y])
     (rule
      [?x :likes ?y]
      [?x :hates ?y]
      (not= x y)
      :return
      [x :marmites y])]]))

(:cache-eavs marmite)
(:e->a->vs marmite)

(q* marmite [:jamie :likes ?x] :return x)

(q* marmite [:jamie ?relates :chris] :return relates)

(q* (unknow marmite [:chris :hates :types]) [:jamie ?relates :chris] :return relates)

(q* marmite [?entity ?relates :chris] :ignore (assert (keyword? relates)))

#_(q* marmite [?entity ?relates :chris] :ignore (assert (= :impossible relates)))

(q? marmite [:jamie ?relates :chris])

(q? marmite [:jamie ?relates :bob])

(q! marmite [:jamie ?relates :chris] :return relates)

#_(q! marmite [:jamie ?relates :chris] :return relates relates)

(q* (knowledge #{[:jamie :has {:books 3 :laptop 1}]} [])
    [:jamie :has ?items]
    (:in [?item ?count] ?items)
    :return
    count)

(q* marmite
    [:jamie :likes ?thing]
    (:collect ?things [[?other :likes ?thing]
                       :return other])
    :return
    [thing things other])
