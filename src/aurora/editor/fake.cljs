(ns aurora.editor.fake
  (:require [aurora.editor.ReactDommy :refer [node]]
            [clojure.string :as string]))

(def state (atom {:rules [{:ml "a [todo] has [text?]" :type :add}
                          {:ml "a [todo] has [order?]" :type :add}
                          {:ml "a [todo] is [being edited?] or [saved?]" :type :add}
                          {:ml "a [todo] is [completed?] or [active?]" :type :add}
                          {:ml "a [todo] is stored" :type :add}
                          {:ml "[when*] [todo input] is changed to [value!]"
                           :sub [{:ml "[current text] has [value?]"
                                  :type :update
                                  "value" 'value}]}
                          {:ml "[when*] [add todo] is clicked"
                           :sub [{:ml "[we need to add a todo]" :type :add}]}
                          {:ml "[when*] [todo input] receives the [enter?] key"
                           :sub [{:ml "[we need to add a todo]" :type :add}]}
                          {:ml "[when*] [we need to add a todo]"
                           :sub [{:ml "[find*] [current text] has [value!]"}
                                 {:ml "[find*] [app] has [counter!]"}
                                 {:ml "[new*] [todo]"}
                                 {:ml "[todo] has [text?]"
                                  :type :add
                                  "text" 'value}
                                 {:ml "[todo] has [order?]"
                                  :type :add
                                  "order" [:span [:span.var.attr "counter"] " + 1"]}
                                 {:ml "[todo] is [active?]"
                                  "type" :add}
                                 {:ml "[todo] is [saved?]"
                                  "type" :add}
                                 {:ml "[current text] has [value?]"
                                  :type :update
                                  "value" ""}]}
                          ]}))


(defn placeholder-ui [rule ph]
  (let [name (if (#{"!" "?" "*"} (last ph))
               (subs ph 0 (- (count ph) 1))
               ph)
        v (when-let [v (get rule name)]
            (cond
             (symbol? v) [:span.var.attr (str v)]
             (vector? v) v
             :else (str v)))
        classes {:var true
                 :keyword (= "*" (last ph))
                 :attr (= "!" (last ph))
                 :bool (= "?" (last ph))}]
    (if-not v
      [:span {:classes classes} name]
      (condp = (:type rule)
        :add [:span {:classes (assoc classes :add true)}
              name
              [:span.value v]]
        :update [:span {:classes (assoc classes :update true)}
                 name
                 [:span.value v]]
        ))))

(defn rule-ui [r]
  (let [placeholders (mapv second (re-seq #"\[(.+?)\]" (:ml r)))
        split (string/split (:ml r) #"\[.+?\]")
        split (if-not (seq split)
                [""]
                split)]
    [:li
     `[:span ~@(mapcat (fn [i cur]
                         (let [ph (get placeholders i)]
                           (if-not ph
                             [cur]
                             [cur (placeholder-ui r ph)]))) (range) split)]
     (when (:sub r)
        [:ul.sub
         (for [s (:sub r)]
           [:li (rule-ui s)])])]
    ))

(defn rules [rs]
  [:ul#rules
   (for [r rs]
     (rule-ui r))])

(defn root-ui []
  [:div#root
   (rules (:rules @state))
   ])

;;*********************************************************
;; Render
;;*********************************************************

(def frame (.-requestAnimationFrame js/window))
(def queued? false)

(defn render! []
  (let [tree (root-ui)]
    (js/React.renderComponent (node tree) js/document.body)
    (set! queued? false)
    ))

(defn queue-render []
  (when-not queued?
    (set! queued? true)
    (frame render!)))

;(queue-render)
