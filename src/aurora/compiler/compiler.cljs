(ns aurora.compiler.compiler
  (:require [clojure.walk :refer [postwalk-replace]]
            [aurora.compiler.jsth :as jsth]
            [aurora.compiler.datalog :as datalog]
            [aurora.compiler.schema :as schema]
            [aurora.compiler.code :as code])
  (:require-macros [aurora.macros :refer [for! check deftraced]]
                   [aurora.compiler.datalog :refer [rule q1 q* q?]]))

;; ;; ids

;; (let [next (atom 0)]
;;   (defn new-id []
;;     (if js/window.uuid
;;       (.replace (js/uuid) (js/RegExp. "-" "gi") "_")
;;       (swap! next inc))))

;; (deftraced id->value [id] [id]
;;   (check id)
;;   (symbol (str "value_" (name id))))

;; ;; compiler

;; (defn jsth? [value]
;;   true ;; TODO not very helpful
;;   )

;; (defn chain [& forms]
;;   (reduce
;;    (fn [tail form]
;;      (clojure.walk/postwalk-replace {::tail tail} form))
;;    (concat (reverse forms) [::tail])))

;; (def schemas
;;   [(schema/has-one :jsth/page (schema/is! jsth?))
;;    (schema/has-one :jsth/step (schema/is! jsth?))
;;    (schema/has-one :jsth/pattern (schema/is! jsth?))
;;    (schema/has-one :jsth/branch (schema/is! jsth?))
;;    (schema/has-one :jsth/guards (schema/is! jsth?))])

;; (def data-rules
;;   [(rule [?e :data/nil _]
;;          :return
;;          [e :jsth/step nil])
;;    (rule [?e :data/number ?number]
;;          :return
;;          [e :jsth/step number])
;;    (rule [?e :data/text ?text]
;;          :return
;;          [e :jsth/step text])
;;    (rule [?e :data/vector ?elems]
;;          :return
;;          [e :jsth/step `(cljs.core.PersistentVector.fromArray
;;                        ~(vec (map id->value elems)))])
;;    (rule [?e :data/map ?keys&vals]
;;          :return
;;          [e :jsth/step `(cljs.core.PersistentHashMap.fromArrays
;;                        ~(vec (map id->value (keys keys&vals)))
;;                        ~(vec (map id->value (vals keys&vals))))])])

;; (def call-rules
;;   [(rule [?e :call/fun ?fun]
;;          [?e :call/args ?args]
;;          :return
;;          [e :jsth/step `(~(id->value fun) ~@(map id->value args))])])

;; (def match-rules
;;   ;; NOTE lack of subqueries hurts here
;;   [[(rule [?e :pattern/any _]
;;           :return
;;           [e :jsth/pattern ::tail])
;;     (rule [?e :data/number ?number]
;;           :return
;;           [e :jsth/pattern `(if (= ::arg ~number) ::tail)])
;;     (rule [?e :data/text ?text]
;;           :return
;;           [e :jsth/pattern `(if (= ::arg ~text) ::tail)])]
;;    [(rule
;;      [?e :pattern/vector ?elems]
;;      (:collect ?jsth-elems [(:in ?i (range (count ?elems)))
;;                             [(nth elems i) :jsth/pattern ?jsth-elem]
;;                             :return [i (nth elems i) jsth-elem]])
;;      (= (count elems) (count jsth-elems))
;;      :return
;;      [e :jsth/pattern `(if (cljs.core.vector_QMARK_ ::arg)
;;                          (if (= ~(count elems) (cljs.core.count ::arg))
;;                            ~(apply chain
;;                                    (for [[i elem jsth-elem] jsth-elems]
;;                                      `(do
;;                                         (let! ~(id->value elem) (cljs.core.nth ::arg ~i))
;;                                         ~(postwalk-replace {::arg (id->value elem)} jsth-elem))))))])
;;     (rule
;;      [?e :pattern/map ?keys&vals]
;;      (:collect ?jsth-keys&vals [(:in ?key (keys ?keys&vals))
;;                                 [?key :jsth/step ?jsth-key]
;;                                 [(get ?keys&vals ?key) :jsth/pattern ?jsth-val]
;;                                 :return
;;                                 [key jsth-key (get keys&vals key) jsth-val]])
;;      (= (count keys&vals) (count jsth-keys&vals))
;;      :return
;;      [e :jsth/pattern `(if (cljs.core.map_QMARK_ ::arg)
;;                          ~(apply chain
;;                                  (for [[key jsth-key val jsth-val] jsth-keys&vals]
;;                                    `(do
;;                                       (let! ~(id->value key) ~jsth-key)
;;                                       (if (cljs.core.contains_QMARK_ ::arg ~(id->value key))
;;                                         (do
;;                                           (let! ~(id->value val) (cljs.core.get ::arg ~(id->value key)))
;;                                           ~(postwalk-replace {::arg (id->value val)} jsth-val)))))))])]
;;    [(rule
;;      [?e :branch/guards ?guards]
;;      (:collect ?jsth-guards [(:in ?guard ?guards)
;;                              [?guard :jsth/step ?jsth-guard]
;;                              :return
;;                              jsth-guard])
;;      (= (count guards) (count jsth-guards))
;;      :return
;;      [e :jsth/guards (apply chain (for [jsth-guard jsth-guards] `(if ~jsth-guard ::tail)))])]
;;    [(rule [?e :branch/pattern ?pattern]
;;           [?pattern :jsth/pattern ?jsth-pattern]
;;           [?e :branch/guards ?guards]
;;           [?e :jsth/guards ?jsth-guards] ;; cant attach directly to guards :(
;;           [?e :branch/action ?action]
;;           [?action :jsth/step ?jsth-action]
;;           :return
;;           [e :jsth/branch `(do
;;                              ~(chain jsth-pattern jsth-guards `(return ~jsth-action))
;;                              ::tail)])]
;;    [(rule
;;      [?e :match/arg ?arg]
;;      [?e :match/branches ?branches]
;;      (:collect ?jsth-branches [(:in ?branch ?branches)
;;                                [?branch :jsth/branch ?jsth-branch]
;;                                :return
;;                                jsth-branch])
;;      (= (count branches) (count jsth-branches))
;;      :return
;;      [e :jsth/step `((fn [~(id->value arg)]
;;                        ~(postwalk-replace {::arg (id->value arg)} (apply chain (concat jsth-branches [`(throw "failed")]))))
;;                      ~(id->value arg))])]])

;; (def page-rules
;;   [(fn [kn]
;;      (q* kn
;;          [?e :page/args ?args]
;;          [?e :page/steps ?steps]
;;          (every? #(seq (datalog/has kn % :jsth/step)) steps) ;; hack to prevent q1 blowing up
;;          :return
;;          (let [jsth-steps (for [step steps]
;;                             (q1 kn
;;                                 [step :jsth/step ?jsth-step]
;;                                 :return
;;                                 `(let! ~(id->value step) ~jsth-step)))]
;;            [e :jsth/page `(fn ~(id->value e) [~@(map id->value args)]
;;                             (do ~@jsth-steps
;;                               (return ~(id->value (last steps)))))])))])

;; (def rules
;;   `[~data-rules
;;     ~call-rules
;;     ~@match-rules
;;     ~page-rules])

;; (def one-rule
;;   (rule
;;    (:collect ?primitives [[?e :js/name ?name] :return [e name]])
;;    (:collect ?pages [[?e :jsth/page ?jsth-page] :return [e jsth-page]])
;;    :return
;;    `((fn []
;;        (do
;;          (let! program {})
;;          ~@(for [[e name] primitives]
;;              `(do
;;                 (let! ~(id->value e) ~(symbol name))
;;                 (set! (.. program ~(id->value e)) ~(id->value e))))
;;          ~@(for [[e jsth-page] pages]
;;              `(do
;;                 ~jsth-page
;;                 (set! (.. program ~(id->value e)) ~(id->value e))))
;;          (return program))))))

;; (defn compile [facts]
;;   (one-rule (datalog/knowledge facts (concat code/rules rules))))

;; (defn knowledge->js [facts]
;;   (-> (compile facts)
;;       first
;;       (jsth/expression->string)))

;; (comment

;;   (-> (clojure.set/union code/stdlib code/example-a)
;;       (datalog/knowledge (concat code/rules rules))
;;       one-rule
;;       first
;;       (jsth/expression->string)
;;       #_js/console.log
;;       js/eval
;;       (.value_root 1 2 3))

;;   (-> (clojure.set/union code/stdlib code/example-b)
;;       (datalog/knowledge (concat code/rules rules))
;;       one-rule
;;       first
;;       (jsth/expression->string)
;;       #_js/console.log
;;       js/eval
;;       (.value_root {"a" 1 "b" 2}))

;; (-> (clojure.set/union code/stdlib code/example-b)
;;     (datalog/knowledge (concat code/rules rules))
;;     one-rule
;;     first
;;     (jsth/expression->string)
;;     #_js/console.log
;;     js/eval
;;     (.value_root {"a" 1 "c" 2}))

;;   )
