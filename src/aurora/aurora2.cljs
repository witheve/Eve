(ns aurora.aurora2
  (:require [cljs.reader :as reader]
            [clojure.walk :as walk]
            [aurora.util.xhr :refer [xhr]]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [cljs.core.async.macros :refer [go]]))

(def core-ns "aurora.aurora2")

(def example {:tags ["program"]
              :name "program1"
              :desc "example"
              :manuals {"root" {:tags ["manual"]
                                :name "root"
                                :desc "do something awesome"
                                :steps [{:tags ["step"]
                                         :type :operation
                                         :op {:type :ref
                                              :ns "program1"
                                              :to "addone"}
                                         :args [{:type :create
                                                 :data {:tags ["number"]
                                                        :value 1}}]}
                                        {:tags ["step"]
                                         :type :create
                                         :data {:tags ["table"]
                                                :value '(aurora.aurora2/table ["foo" "bar"] [3 4])}}
                                        {:tags ["step"]
                                         :type :create
                                         :data {:tags ["list"]
                                                :value [1 2 3 4]}}
                                        {:tags ["step"]
                                         :type :operation
                                         :op {:type :ref
                                              :ns core-ns
                                              :to "each"}
                                         :args [{:tags ["ref"]
                                                 :type :ref
                                                 :to :prev}
                                                {:tags ["ref"]
                                                 :type :ref
                                                 :ns "program1"
                                                 :to "addone"}]}
                                        ]}
                        "addone" {:tags ["manual"]
                                  :name "addone"
                                  :desc "add one"
                                  :params ["cur"]
                                  :steps [{:tags ["math"]
                                           :type :transformer
                                           :name "aurora.math"
                                           :data ["+" 1 {:tags ["ref"]
                                                         :type :ref
                                                         :to "cur"}]}]}}})

(def editor {:programs [example]})


;;create, operation, ref

(defn squash-prev [steps]
  (reduce (fn [final cur]
            (let [replaced (walk/postwalk-replace {'__PREV__ '_PREV_REPLACE_} cur)]
              (if (= cur replaced)
                (conj final cur)
                (assoc final (dec (count final)) (list 'let ['_PREV_REPLACE_ (last final)] replaced)))))
          []
          steps))

(defn is-ref? [r]
  (and (map? r) (= (:type r) :ref)))

(defn resolve-ref [ref]
  (if (:ns ref)
    (str (:ns ref) "/" (:to ref))
    (:to ref)))

(defmulti transform :name)

(defmethod transform "aurora.math" [{:keys [data]}]
  (for [i data]
    (cond
     (number? i) i
     (string? i) (symbol i)
     (and (map? i) (= (:type i) :ref)) (node->cljs i)
     (vector? i) (transform {:name "aurora.math" :data i})
     :else i)))

(defmulti node->cljs :type)

(defmethod node->cljs :create [{:keys [data]}]
  (walk/prewalk (fn [x]
                  (if (is-ref? x)
                    (node->cljs x)
                    x))
                (:value data)))

(defmethod node->cljs :value [{:keys [value]}]
  )

(defmethod node->cljs :operation [{:keys [op args]}]
  (conj (for [arg args]
          (node->cljs arg))
        (symbol (resolve-ref op))))

(defmethod node->cljs :transformer [this]
  (transform this))

(defmethod node->cljs :ref [{:keys [to] :as ref}]
  (if (= to :prev)
    '__PREV__
    (symbol (resolve-ref ref))))

(defn with-body [manual program]
  (assoc manual :body (for [s (:steps manual)]
                        (node->cljs s))))

(defn with-augmentations [manual program]
  (let [body (reduce (fn [final cur]
                       (conj final cur '(aurora.aurora2/capture __PREV__))
                       )
                     []
                     (:body manual))]
    (assoc manual :body (squash-prev body))))

(defn with-optimizations [manual program]
  manual
  )

(defn with-code-str [manual program]
  (assoc manual :code (str "(defn "
                           (:name manual)
                           " "
                           (pr-str (mapv symbol (:params manual)))
                           " "
                           (apply str (map pr-str (:body manual)))
                           ")")))


(defn program->cljs [program]
  (let [program (assoc program :manuals
                  (into {}
                        (for [[name m] (:manuals program)]
                          [name
                           (-> m
                               (with-body program)
                               (with-augmentations program)
                               (with-optimizations program)
                               (with-code-str program)
                               )])))]
    (assoc program :code (reduce #(str % %2 "\n")
                                 (str "(ns " (:name program) ")\n")
                                 (map :code (vals (:manuals program)))))))


(program->cljs example)



(defn program-list [editor]
  [:ul.programs
   (for [p (:programs editor)]
     [:li (:desc p)])])

(program-list editor)

(defmulti step-ui :type)

(defmethod step-ui :create [node]
  [:li.step
   [:div.desc "Create"]
   [:div.result ]]
  )

(defmethod step-ui :operation [node]
  [:li.step
   [:div.desc "Op"]
   [:div.result ]]
  )

(defn manual-ui [manual]
  [:ul
   (for [step (:steps manual)]
     (step-ui step))])

(get-in example [:manuals "root"])

(manual-ui (get-in example [:manuals "root"]))

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

(defn isTable [t]
  (-> thing meta ::table))

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

(go
 (println (<! (xhr [:post "http://localhost:8082/code"] {:code (str "[" (-> example (program->cljs) :code) "]")}))))

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