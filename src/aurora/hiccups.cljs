(ns aurora.hiccups
  (:require [hiccups.runtime :as hiccup]
            [dommy.core :as dommy]
            [clojure.walk :as walk])
  (:require-macros [hiccups.core :refer [html]]
                   [dommy.macros :refer [node sel1 sel]]))

(defn root-inject [ui]
  (let [wrapper (sel1 :#wrapper)
        ws (sel1 "#aurora .workspace")
        scroll-top (when ws (.-scrollTop ws))]
    (dommy/set-html! wrapper "")
    (.time js/console "[hiccups][root-inject]")
    (dommy/set-html! wrapper (html ui))
    (.timeEnd js/console "[hiccups][root-inject]")
    (focus-walk wrapper)
    (when-let [ws (sel1 "#aurora .workspace")]
      (set! (.-scrollTop ws) scroll-top))))

(comment

;(set! js/aurora.core.root-inject root-inject)

(def foo (walk/postwalk (fn [x]
                          (if (fn? x)
                            "fn"
                            x)) js/current-ui))

(defn try-lots []
  (dotimes [x 30]
    (time (html foo)))
  )

(time (clj->js js/current-ui))

(dommy/listen! (sel1 :body) :click (fn [] (try-lots)))

    (time (node (concat foo foo foo foo foo foo)))

  )
