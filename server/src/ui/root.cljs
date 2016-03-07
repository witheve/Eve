(ns ui.root
  (:refer-clojure :exclude [find remove])
  (:require-macros [ui.macros :refer [elem afor log box text button input dispatch extract for-fact]]))

(enable-console-print!)

(declare render)

;;---------------------------------------------------------
;; Runtime wrapper
;;---------------------------------------------------------

(defonce eve (js/Runtime.indexer))

(defn find-one [table & [info]]
  (.findOne eve (name table) (clj->js info)))

(defn find [table & [info]]
  (.find eve (name table) (clj->js info)))

(defn add [diff table fact]
  (.add diff (name table) (clj->js fact))
  diff)

(defn remove [diff table fact]
  (.remove diff (name table) (clj->js fact))
  diff)

;;---------------------------------------------------------
;; local state
;;---------------------------------------------------------

(defn state []
  )

(defn set-state! [key ])

;;---------------------------------------------------------
;; Styles
;;---------------------------------------------------------

(defn style [& things]
  (let [mixins (take-while #(not (keyword? %)) things)
        non-mixins (drop-while #(not (keyword? %)) things)
        pairs (partition 2 non-mixins)
        start (reduce str "" mixins)]
    (reduce (fn [prev [a b]]
              (str prev (name a) ":" b "; "))
            start
            pairs)))

(def shared-style (style :color "white"))

(defonce num (atom 0))

;;---------------------------------------------------------
;; Root
;;---------------------------------------------------------

(defn root []
  (button :children (array (text :text (str "increment! " @num)))
          :click #(dispatch (swap! num inc))))


; (defn root []
;   (let [kids (for-fact [fact (find :woot)
;                         :extract [foo :foo
;                                   bar :bar]]
;                        (text :text (str "foo " foo " bar " bar " count " @num)))]
;     (button :children kids
;             :click (fn [event elem]
;                      (swap! num inc)
;                      (dispatch diff))
;             :style (style shared-style
;                           :background "black"
;                           :margin "20px"
;                           :padding "20px"))))

;;---------------------------------------------------------
;; Rendering
;;---------------------------------------------------------

(defonce renderer (atom false))

(defn render []
  (when (not (.-queued @renderer))
    (set! (.-queued @renderer) true)
    (js/requestAnimationFrame
      (fn []
        (let [ui (root)]
          (.render @renderer #js [ui])
          (set! (.-queued @renderer) false))))))

;;---------------------------------------------------------
;; Init
;;---------------------------------------------------------

(defn init []
  (when (not @renderer)
    (reset! renderer (new js/Renderer))
    (.appendChild js/document.body (.-content @renderer)))
  (dispatch diff
            (add diff :woot {:foo 1 :bar 2}))
  (render))

(init)
