(ns aurora.core
  (:require [clojure.walk :as walk]
            [aurora.keyboard :as kb]
            [aurora.transformers.chart :as chart]
            [aurora.transformers.editor :as editor]
            [aurora.transformers.math :as math]
            [dommy.core :as dommy]
            [dommy.utils :as utils]
            [cljs.reader :as reader]
            [clojure.string :as string]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel1 sel]]
                   [aurora.macros :refer [with-path]]
                   [cljs.core.async.macros :refer [go]]))

(set! js/cljs.core.*print-fn* #(when-not (empty? (.trim %))
                                 (.log js/console (.trim %))))

(defprotocol IChannel
  (-history [this])
  (-enqueue [this v]))

(deftype Channel [stuff watches async-channel]
  protos/ReadPort
  (take! [port fn-handler] (protos/take! async-channel fn-handler))
  protos/WritePort
  (put! [port val fn-handler]
        (protos/put! async-channel val fn-handler)
        (-enqueue port val))
  protos/Channel
  (close! [this] (protos/close! async-channel))
  IChannel
  (-history [this] (seq (.-stuff this)))
  (-enqueue [this v] (when-not (= (first (.-stuff this)) v)
                       (set! (.-stuff this) (conj stuff v))))
  IDeref
  (-deref [this] (first (-history this))))

(defn channel []
  (let [c (Channel. '() (array) (chan))]
    c))

(defn enqueue [c v]
  (put! c v)
  c)

(defn history [c]
  (-history c))

(defn html? [e]
  (instance? js/HTMLElement e))

(defn primitive? [e]
  (or (string? e) (number? e) (keyword? e)))

(defn str-contains? [s needle]
  (> (.indexOf s needle) -1))

(def stop false)
(def ^:dynamic *path* [])
(def contexts (atom #{}))

(defn ctx! [c]
  (swap! contexts conj c)
  (kb/merge-keys @contexts))

(defn rem-ctx! [c]
  (swap! contexts disj c)
  (kb/merge-keys @contexts))

;;Program is a set of data channels and then a set of pipelines
;; {:data {foo [1 2 3]}
;;  :pipelines {p1 [foo bar baz]
;;              p2 [blah glah wlah]}}
(def program (channel))

;;UI reacts to program changes and ui changes to update the screen
(def ui (channel))

(defn menu [menu]
  [:div.menu {:style (str "top: " (:top menu) "px; left: " (:left menu) "px;")}
   (for [[i item] (map-indexed vector (:items menu))]
     (-> (node [:div {:class (str "quad quad" i)} (:label item)])
         (dommy/listen! :click #(do
                                  ((:click item))
                                  (put! ui (assoc @ui :menu nil))))))])

(defn rep-attr [attrs info]
  (merge {:path *path*} attrs info {:class (str (:class attrs) " " (:class info))}))

(defmulti ->rep #(cond (vector? %) :vec
                       (map? %) :map
                       (string? %) :string
                       (html? %) :html
                       (number? %) :number
                       :else (type %)))

(defmethod ->rep :html [v info]
  v)

(defmethod ->rep :vec [v info]
  (let [attr (rep-attr {:class "vector"} info)
        elem [:ol (rep-attr {:class "vector"} info)
              (doall
               (for [[k v] (map-indexed vector v)]
                 (with-path k
                   [:li {:class (if (vector? v) "vector" "")}
                    (->rep v (when (:recurse info)
                               info))])))]
        elem (node elem)]
;    (when (= (count *path*) 2)
;      (.. (js/$ elem) (sortable )))
    elem
    ))

(defmethod ->rep :map [v info]
  [:p (rep-attr {:class "map"} info)
   (doall
    (for [[k v] v]
      [:span.entry
       (with-path [k ::key]
         (->rep k (when (:recurse info)
                    info)))
       (with-path k
         (->rep v (when (:recurse info)
                    info)))]))])

(defmethod ->rep :string [v info]
  [:span (rep-attr {:class "string"} info) (str v)])

(defmethod ->rep :number [v info]
  [:span (rep-attr {:class "number"} info) (str v)])

(defmethod ->rep :default [v info]
  [:span (rep-attr {:class "unknown"} info) (pr-str v)])

(defn ->data-rep [v]
  (->rep v {:class "data"}))

(defn data-ui [data]
  (with-path :data
    [:div.data-container
     (doall
      (for [[k v] data]
        (with-path k
          (->data-rep v))))]))

(defn input-focus []
  (rem-ctx! :app)
  (ctx! :input))

(defn input-blur []
  (rem-ctx! :input)
  (ctx! :app))

(defn input [path]
  (-> (node [:input {:type "text" :path path :value (get-in @program path)}])
      (dommy/listen! :focus input-focus :blur input-blur)))

(defn substitute-key [prog path neue]
  (let [val (get-in prog path)]
    (-> (update-in prog (butlast path) dissoc (last path))
        (update-in prog (butlast path) assoc neue val))))

(defn adorn [program ui]
  (reduce (fn [prog path]
            (if (= (last path) ::key)
              (substitute-key prog path (input path))
              (assoc-in prog path (input path))))
          program
          (:inputs ui)))

(defmulti workspace-rep #(:state %))

(defmethod workspace-rep :structure [ui program]
  (let [program (adorn program ui)]
    (when-let [cur (get-in program (:current ui))]
      (with-path (:current ui)
        (->rep cur {:recurse true :class "editable"})))))

(defmethod workspace-rep :pipeline [ui program]
  (when-let [cur (-> program :pipelines (get (:current ui)))]
    [:p (str "In pipeline: " (:current ui) " " (pr-str cur))]))

(defmethod workspace-rep :default [ui program]
  [:p "nothing in here"])

(defn workspace-ui [program ui]
  [:div.workspace
   (when (:current ui)
     (workspace-rep ui program))
   ])

(defn inject [ui]
  (dommy/set-html! (sel1 :#wrapper) "")
  (dommy/append! (sel1 :#wrapper) (node ui)))

(defn ->screen [program ui]
  (-> [:div#aurora {:tabindex 0}
       ;(data-ui (:data program))
       (workspace-ui program ui)
       (when (:menu ui)
         (menu (:menu ui)))]
      (inject))
  (when-let [elem (and (:cursor ui)
                       (sel1 (str "[path='" (string/replace (pr-str (:cursor ui)) "\"" "\\\"") "']")))]
    (println "we have a cursor elem")
    (dommy/add-class! elem :active))
  (when-let [elem (and (:focus ui)
                       (sel1 (str "input[path='" (string/replace (pr-str (:focus ui)) "\"" "\\\"") "']")))]
    (.focus elem)))

(comment
(go
 (while (not stop)
   (alts! [program ui])
   (->screen @program @ui)))
  )

(defn e->elem [e]
  (.-selectedTarget e))

(defn e->path [e]
  (reader/read-string (dommy/attr (e->elem e) :path)))

(defn input->value [input]
  (let [s (dommy/value input)]
    (if (str-contains? s " ")
      s
      (let [s (reader/read-string s)]
        (if (symbol? s)
          (str s)
          s)))))

(defn click-data [e]
  (put! ui (assoc @ui :state :structure :current (e->path e))))

(defn click-editable [e]
  (if (primitive? (get-in @program (e->path e)))
    (put! ui (-> (update-in @ui [:inputs] conj (e->path e))
                 (assoc :focus (e->path e))))))

(defn keydown-input [e]
  (when (= 13 (.-keyCode e))
    (put! program (assoc-in @program (e->path e) (input->value (e->elem e))))
    (put! ui (-> (update-in @ui [:inputs] disj (e->path e))
                 (assoc :focus nil)))))

(defn contextmenu-workspace [e]
  (.preventDefault e)
  (.stopPropagation e)
  (put! ui (assoc @ui :menu {:top (.-clientY e)
                             :left (.-clientX e)
                             :items [{:label "vector"
                                      :click #(println "adding a vector")}
                                     {:label "map"
                                      :click #(println "adding a map")}]})))

(defn click-body [e]
  (when (:menu @ui)
    (put! ui (assoc @ui :menu nil))))

(comment
(dommy/listen! [(sel1 :body) :.data] :click #(click-data %))
(dommy/listen! [(sel1 :body) :.editable] :click #(click-editable %))
(dommy/listen! [(sel1 :body) :input] :keydown #(keydown-input %))
(dommy/listen! [(sel1 :body) :.workspace] :contextmenu #(contextmenu-workspace %))
(dommy/listen! (sel1 :body) :click #(click-body %))
  )

(put! program {:data {'blah [1 2 3]
                      'foo []
                      'user {:name "chris"
                             :data [1 2 3]}}
               :pipelines {'p1 '[+ 2 3 (first foo)]}})

(put! ui {:state :structure
          :current [:data 'foo]
          :cursor [:data 'foo]
          :menu nil
          :focus nil
          :inputs #{}})

(defn cursor-item []
  (get-in @program (@ui :cursor)))

(defn cursor-parent []
  (get-in @program (butlast (@ui :cursor))))

(defn conj-cursor [v]
  (put! ui (update-in @ui [:cursor] conj v)))

(defn pop-cursor []
  (put! ui (update-in @ui [:cursor] #(vec (butlast %)))))

(defn assoc-last-cursor [v]
  (put! ui (update-in @ui [:cursor] #(assoc % (dec (count %)) v))))

(defn roll-over [count cur dir]
  (let [last-index (dec count)
        neue (dir cur)]
    (cond
     (= count 0) 0
     (and (= dec dir) (<= cur 0)) last-index
     (and (= inc dir) (>= cur last-index)) 0
     :else neue)))

(defn up! []
  (when (> (count (:cursor @ui)) 2)
    (pop-cursor)))

(defn down! []
  (let [item (cursor-item)]
    (cond
     (map? item) (conj-cursor (-> item first first))
     (vector? item) (conj-cursor 0)
     :else nil)))

(defn left! []
  (let [parent (cursor-parent)
        cur (last (:cursor @ui))]
    (cond
     (map? parent) (conj-cursor (-> item first first))
     (vector? parent) (assoc-last-cursor (roll-over (count parent) cur dec))
     :else nil)
    )
  )

(defn right! []
  (let [parent (cursor-parent)
        cur (last (:cursor @ui))]
    (cond
     (map? parent) (conj-cursor (-> item first first))
     (vector? parent) (assoc-last-cursor (roll-over (count parent) cur inc))
     :else nil)
    )
  )

(defn modify! []
  )

(defn add! [cur orig-path val]
  (when (= (count cur) 0)
    (let [[neue path] (if (map? cur)
                        [(conj cur [val nil]) (conj orig-path nil)]
                        [(conj cur val) (conj orig-path 0)])]
      (put! program (assoc-in @program path val))
      path
      )))

(defn add-map! []
  (put! program (insert-after-cursor (:cursor @ui) {}))
  )

(defn edit! [path]
  (let [path (or path (:cursor @ui))
        cur (get-in @program path)]
    (if (primitive? cur)
      (put! ui (-> (update-in @ui [:inputs] conj path)
                   (assoc :focus path)))
      )))

(defn vector-insert [v i thing]
  (vec (concat (take i v) [thing] (drop i v))))

(defn vector-remove [v i]
  (vec (concat (take i v) (drop (inc i) v))))

(defn insert-after-cursor [cursor thing]
  (let [cur (get-in @program cursor)
        [path cur] (if (and (vector? cur) (= 0 (count cur)))
                     [cursor cur]
                     [cursor (get-in @program (butlast cursor))])
        index (if (number? (last path))
                (inc (last path))
                0)
        final-path (conj (if (= 0 index)
                           (vec cursor)
                           (vec (butlast cursor))) index)]
    (when (vector? cur)
      [final-path
       (cond
        (= 0 (count cur)) (update-in @program path vector-insert index thing)
        :else (update-in @program (butlast path) vector-insert index thing)
        )])))

(defn insert! [path index]

  )

(defn add-vector! []
  (let [[path prog] (insert-after-cursor (:cursor @ui) [])]
    (println "vec path: " path)
    (put! program prog)
    (put! ui (assoc @ui :cursor path))
    ))

(defn add-nil! []
  (let [[path prog] (insert-after-cursor (:cursor @ui) "")]
    (println path)
    (put! program prog)
    (put! ui (assoc @ui :cursor path))
    (edit!)))

(reset! kb/keys {:app {"v" [#(add-vector!)]
                       "m" [#(add-map!)]
                       "i" [#(add-nil!)]
                       "e" [#(edit!)]
                       "d" [#(up!)]
                       "f" [#(down!)]
                       "h" [#(left!)]
                       "l" [#(right!)]
                       "j" [#(down!)]
                       "k" [#(up!)]
                       "left" [#(up!)]
                       "right" [#(down!)]
                       "up" [#(left!)]
                       "down" [#(right!)]}})
;(kb/merge-keys [:app])

(defn type [thing]
  (cond
   (or (instance? js/HTMLElement thing)
       (instance? (.-HTMLElement (aget (.-frames js/window) "runner")) thing)) :html
   (list? thing) :list
   (map? thing) :map
   (vector? thing) :vector
   (set? thing) :set
   (number? thing) :number
   (keyword? thing) :keyword
   (symbol? thing) :symbol
   (string? thing) :string
   (fn? thing) :fn
   (seq? thing) :seq
   :else nil))

(def walk walk/postwalk)
(def prewalk walk/prewalk)

(defn !to-data [name thing]
  (if (aget js/aurora.pipelines name)
    (throw (js/Error. "Cannot replace data only supply new data"))
    (aset js/aurora.pipelines name thing)))

(defn extract [things k]
  (map #(get % k) things))

(def !chart chart/!chart)
(def !math math/!math)

(defn last-path [thing]
  (-> thing meta :path last))

(defn munge* [thing]
  (-> (str thing)
      (string/replace "-" "_")
      (string/replace ">" "_GT_")
      (string/replace "<" "_LT_")
      (string/replace "!" "_BANG_")
      (string/replace "*" "_STAR_")
      ))

(def !runner editor/!runner)
(def !in-running editor/!in-running)
