(ns aurora.core
  (:require [clojure.walk :as walk]
            [dommy.core :as dommy]
            [dommy.utils :as utils]
            [cljs.reader :as reader]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]])
  (:require-macros [dommy.macros :refer [node sel1 sel]]
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
  (close! [this] (close! async-channel))
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

(def c (channel))

(defn redraw [thing]
  (dommy/set-html! (sel1 :body) "")
  (dommy/append! (sel1 :body) thing))

(def root (channel))
(def ui-channel (channel))
(def update-chan (chan))
(def events (chan))

(def paths (js-obj))

(defn header [w]
  [:div#top
   (for [[id d] (:data w)]
     (->rep d [:data id]))
   [:div.map {:draggable "true" :data-structure "map"} "map"]
   [:div.vector {:draggable "true" :data-structure "vector"} "vector"]
   ])

(def paths nil)

(defn ->rep [t path]
  (let [id (next-pid)]
    (assoc! paths id path)
    (assoc! paths path id)
    (cond
     (vector? t) [:div.vector {:draggable "true" :data-id id} (for [[i v] (map-indexed vector t)] (->rep v (conj path i)))
                  (placeholder (next-pid) (conj path (count t)))]
     (map? t) [:div.map {:draggable "true" :data-id id}
               [:table
                [:tbody
                 (for [[k v] t]
                   [:tr.entry [:td.key (->rep k (conj path k ::key))] [:td.value (->rep v (conj path k))]])
                 [:tr.entry [:td.key (placeholder (next-pid) (conj path ::key))] [:td.value ]]
                 ]]]
     (or (list? t) (seq? t)) (apply (funcs (first t)) (conj (rest t) id))
     (string? t) [:div.string {:draggable "true" :data-id id} t]
     :else [:div.unknown {:draggable "true" :data-id id} (pr-str t)])))

(defn main-area [w]
  [:div#middle
   (for [[i thing] (map-indexed vector (:main w))]
     (->rep thing [:main i]))])

(defn footer [w]
  [:div#bottom
   (try
   (when (:result w)
     (node (:result w)))
     (catch js/Error e
       [:p "Invalid input"]))]
  )

(defn ->ui [world]
  [:div
   (header world)
   (main-area world)
   (footer world)])

(let [cur (atom 0)]
  (defn next-pid []
    (str (swap! cur inc))
    ))

(defn placeholder [id path]
  (assoc! paths id path)
  [:div.droptarget {:data-id id}])

(defn insert [id val]
  [:input {:type "text" :data-id id :value (or val "")}])

(defmulti create keyword)

(defmethod create :map [_]
  {(list 'placeholder (next-pid)) (list 'placeholder (next-pid))})

(defmethod create :vector [_]
  [(list 'placeholder (next-pid))])

(defmulti add-placeholders identity)

(defmethod add-placeholders :map [_ m]
  (assoc m (list 'placeholder (next-pid)) (list 'placeholder (next-pid))))

(defmethod add-placeholders :vector [_ v]
  (conj v (list 'placeholder (next-pid))))

(def funcs {'placeholder placeholder
            'insert insert})

(defn replace-insert [id structure rep]
  (walk/postwalk-replace {(list 'insert id) rep} structure))

(defn replace-placeholder [id structure rep]
  (let [cur (list 'placeholder id)]
  (walk/postwalk (fn [x]
                   (if (or (and (vector? x) (some #{cur} x))
                           (and (map? x) (x cur)))
                     (add-placeholders (if (map? x)
                                         :map
                                         :vector)
                                       (walk/postwalk-replace {cur rep} x))
                     x))
                 structure)))

(defn dissoc-in
  [m [k & ks :as keys]]
  (if ks
    (if-let [nextmap (get m k)]
      (let [newmap (dissoc-in nextmap ks)]
        (assoc m k newmap))
      m)
    (dissoc m k)))

(defn update [cur]
  (let [[id value] inputs
        path (get paths id)
        [path key?] (if (= (last path) ::key)
                      [(butlast path) :key]
                      [path])
        cur (if key?
              (dissoc-in cur path)
              cur)
        val (try
              (if (> (.indexOf value " ") 0)
                value
                (let [fin (reader/read-string value)]
                  (if (symbol? fin)
                    (str fin)
                    fin)))
              (catch js/Error e
                value))]
    (set! inputs nil)
    (if key?
      (assoc-in cur (concat (butlast path) [val]) nil)
      (assoc-in cur path val))))

(defn handle-inserts [struct ui]
  (if-not (:insert ui)
    struct
    (do
      (go
       (<! update-chan)
       (put! events {:type :focus :path (:insert ui)}))
      (if (= (last (:insert ui)) ::key)
        (assoc-in struct (concat (butlast (:insert ui)) [(list 'insert)]) nil)
        (assoc-in struct (:insert ui) (list 'insert (get-in struct (:insert ui))))))))

(.-outerHTML (node ["li" {"class" "woot"} "zomg"]))

(defn ->result [cur]
  (try
    (assoc cur :result (for [thing (:main cur)]
                               (node thing)))
    (catch js/Error e
      (.error js/console e)
      (assoc cur :result [:p "Invalid result"]))))

(go
 (while true
   (let [[_ ch] (alts! [root ui-channel])
         cur @root
         ui @ui-channel]
     (if inputs
       (put! root (-> (update cur)
                      (->result)))
       (do
         (set! paths (transient {}))
         (-> cur
             (->result)
             (handle-inserts ui)
             (->ui)
             (redraw))
         (set! paths (persistent! paths))
         (put! update-chan true))))))

(dommy/listen! [(sel1 :body) :#top :div] :click (fn [e]
                                                (put! events {:type :select
                                                              :e e})))

(dommy/listen! [(sel1 :body) :#top :div] :dragstart (fn [e]
                                                (put! events {:type :dragstart
                                                              :target (.-target e)
                                                              :e e})))
(dommy/listen! [(sel1 :body) :#middle :.droptarget] :dragover (fn [e]
                                                     (.preventDefault e)
                                                     ))
(dommy/listen! [(sel1 :body) :#middle :div] :dragenter (fn [e]
                                                     (.preventDefault e)
                                                                 (put! events {:type :dragenter
                                                                               :e e
                                                                               :target (.-target e)})
                                                     ))
(dommy/listen! [(sel1 :body) :#middle :div] :dragleave (fn [e]
                                                     (.preventDefault e)
                                                                (.stopPropagation e)
                                                                (put! events {:type :dragexit
                                                                               :e e
                                                                               :target (.-target e)})
                                                     ))
(dommy/listen! [(sel1 :body) :#middle :.droptarget] :drop (fn [e]
                                                            (.preventDefault e)
                                                            (.stopPropagation e)
                                                            (.log js/console e)
                                                            (put! events {:type :drop
                                                                          :e e
                                                                          :target (.-target e)})
                                                     ))

(dommy/listen! [(sel1 :body) :#middle] :dragover (fn [e]
                                                     (.preventDefault e)
                                                     ))
(dommy/listen! [(sel1 :body) :#middle] :drop (fn [e]
                                               (when-not (.-defaultPrevented e)
                                                            (.preventDefault e)
                                                            (.stopPropagation e)
                                                            (put! events {:type :drop-add
                                                                          :e e
                                                                          :target (.-target e)}))
                                                     ))

(dommy/listen! [(sel1 :body) :input] :keyup (fn [e]
                                              (put! events {:type :input
                                                            :e e
                                                            :id (dommy/attr (.-target e) :data-id)
                                                            :value (dommy/value (.-target e))})))

(dommy/listen! [(sel1 :body) :#middle :.droptarget] :click (fn [e]
                                                             (put! events {:type :insert
                                                                           :target (.-target e)
                                                                           :e e})))

(dommy/listen! [(sel1 :body) :#middle :.unknown] :click (fn [e]
                                                             (put! events {:type :insert
                                                                           :target (.-target e)
                                                                           :e e})))

(dommy/listen! [(sel1 :body) :#middle :.string] :click (fn [e]
                                                             (put! events {:type :insert
                                                                           :target (.-target e)
                                                                           :e e})))

(set! stop false)
(def dragging nil)
(def inputs nil)

(defmulti handle-event :type)
(defmethod handle-event :dragstart [e]
  (set! dragging (:target e)))

(defmethod handle-event :drop [e]
  (let [drag-id (dommy/attr dragging :data-id)]
  (when-let [id  (dommy/attr (:target e) "data-id")]
    (if-let [type (dommy/attr dragging "data-structure")]
      (put! root (assoc-in @root (get paths id) (if (= type "vector")
                                                                             []
                                                                             {})))
      (put! root (assoc-in @root (get paths id) (get-in @root (get paths drag-id))))))
  (set! dragging nil)))

(defmethod handle-event :drop-add [e]
  (if-let [type (dommy/attr dragging "data-structure")]
    (put! root (assoc @root :main (conj (:main @root) (if (= type "vector")
                                                        []
                                                        {}))))
    (put! root (assoc @root :main (conj (:main @root) (get-in @root (get paths (dommy/attr dragging :data-id)))))))
  (set! dragging nil))

(defmethod handle-event :insert [e]
  (when-let [id  (dommy/attr (:target e) "data-id")]
    (put! ui-channel (assoc @ui-channel :insert (get paths id)))))

(defmethod handle-event :focus [e]
  (let [id (or (:id e) (get paths (:path e)))
        cur (sel1 (str "[data-id='" id "']"))]
    (when cur
      (.focus cur))))

(defmethod handle-event :input [e]
  (set! inputs [(:id e) (:value e)])
  (when (= 13 (.-keyCode (:e e)))
    (put! events {:type :submit :id (:id e) :value (:value e)})))

(defmethod handle-event :submit [e]
  (put! ui-channel (assoc @ui-channel :insert nil)))

(comment
(defmethod handle-event :dragenter [e]
  (dommy/add-class! (:target e) :over))

(defmethod handle-event :dragexit [e]
  (dommy/remove-class! (:target e) :over))
  )

(defmethod handle-event :default [e]
  (println "Unhandled event: " e))

(go
 (while (not stop)
   (let [ev (<! events)]
     (try
       (handle-event ev)
       (catch js/Error e
         (.error js/console e))))))

(put! root {:data {'foo [1 2 3]
                   'woot [{:name "mac and cheese"} {:name "burgers"}]
                   'blugah {:name "chris" :age 26 :mood :happy}}
            :main '[]
            :result nil})

(-> @root)
