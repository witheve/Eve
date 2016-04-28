(ns ui.client
  (:refer-clojure :exclude [find remove when])
  (:require [clojure.set :as set]
            [clojure.walk :as walk])
  (:require-macros [ui.macros :refer [afor when]]))

(def USE-SERVER? true)
(def BE-STUPIDLY-OPTIMISTIC? true)
(def LOCAL-ONLY-TAGS #{"selection" "grid-user-state"})

(def KEYS {:enter 13
           :shift 16
           :tab 9
           :escape 27
           :backspace 8
           :left 37
           :up 38
           :right 39
           :down 40})

(defn query-string [obj]
  (pr-str (walk/prewalk (fn [cur]
                          (if-not (symbol? cur)
                            cur
                            (symbol (name cur))))
                        obj)))

;;---------------------------------------------------------
;; Runtime wrapper
;;---------------------------------------------------------

(defonce eve (.indexer js/Runtime))

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
;; Websocket
;;---------------------------------------------------------

(def websocket-address (str "ws://" (-> js/window
                                        (.-location)
                                        (.-host))))
(defonce websocket (atom nil))
(defonce id-to-query (atom {}))

(defonce renderer (atom false))
(defonce renderers (atom {}))
(defn add-renderer [name renderer]
  (swap! renderers assoc name renderer))

(defn render []
  (when (not (.-queued @renderer))
    (set! (.-queued @renderer) true)
    (js/requestAnimationFrame
      (fn []
        (let [ui (filter identity (map #(%1) (vals @renderers)))]
          (.render @renderer (clj->js ui))
          (set! (.-queued @renderer) false))))))

(defn results-to-objects [fields results]
  (if-not results
    (array)
    (let [len (count fields)]
      (afor [result results]
            (let [obj (js-obj)]
              (dotimes [ix len]
                (aset obj (aget fields ix) (aget result ix)))
              obj)))))

(declare locally-add-eavs!)
(declare locally-remove-eavs!)

(defn send-websocket [message]
  (let [json-message (.stringify js/JSON (clj->js message))]
    (.send @websocket json-message)))

(defn send-query [id query]
  (send-websocket {:id id :type "query" :query query}))

(defn send-close [id]
  (send-websocket {:id id :type "close"}))

(defn websocket-init []
  (let [socket (new js/WebSocket websocket-address)]
    (set! (.-onopen socket) (fn [event]
                              (send-query "all facts"
                                          (query-string `(query [e a v]
                                                                (fact-btu e a v))))
                              (println "connected to server!")))
    (set! (.-onerror socket) (fn [event]
                               (println "the socket errored :(")))
    (set! (.-onclose socket) (fn [event]
                               (println "the socket closed :( :( :(")))
    (set! (.-onmessage socket) (fn [event]
                                 (let [data (.parse js/JSON (.-data event))
                                       changed? (atom false)]
                                   (condp = (.-type data)
                                     "result" (if (= (.-id data) "all facts")
                                                (let [inserts (.-insert data)
                                                      removes (.-remove data)
                                                      context (js-obj)]
                                                  (println "GOT MESSAGE AT " (.now (.-performance js/window)))
                                                  (when (seq removes)
                                                    (reset! changed? true)
                                                    (println removes)
                                                    (locally-remove-eavs! context removes))
                                                  (when (seq inserts)
                                                    (reset! changed? true)
                                                    (locally-add-eavs! context inserts)))
                                                (when (seq (.-fields data))
                                                  (let [fields (.-fields data)
                                                        adds (results-to-objects fields (.-insert data))
                                                        removes (results-to-objects fields (.-remove data))
                                                        diff (.diff eve)]
                                                    (when (seq adds)
                                                      (reset! changed? true)
                                                      (.addMany diff (.-id data) adds))
                                                    (when (seq removes)
                                                      (reset! changed? true)
                                                      (.removeFacts diff (.-id data) removes))
                                                    (when @changed?
                                                      (.applyDiff eve diff))
                                                    (println "ADDS" adds)
                                                    (println "REMOVES" removes))))
                                     "error" (.error js/console "uh oh")
                                     "query-info" (do)
                                     )
                                   (when @changed?
                                     (println "GOT CHANGED")
                                     (render))
                                   (println (.-data event)))))
    ;; set a handler for when we navigate away so that we can make sure all
    ;; queries for this client are closed.
    (set! (.-onbeforeunload js/window)
          (fn []
            (send-close "all facts")
            (for [[k query-id] @id-to-query]
              (send-close query-id))
            nil))
    (reset! websocket socket)))


(defn replace-and-send-query [id query]
  (let [current (@id-to-query id)
        new-id (js/uuid)]
    (when current
      (send-close current)
      ;; remove the values that were in the table
      )
    (send-query new-id query)
    (swap! id-to-query assoc id new-id)))

;;---------------------------------------------------------
;; local state
;;---------------------------------------------------------

(defonce facts-by-id (js-obj))
(defonce facts-by-tag (js-obj))
(defonce entity-name-pairs (atom []))

(defonce local-ids (atom #{}))

(defn get-fact-by-id [id]
  (aget facts-by-id id))

(defn entities [info]
  (let [{:keys [id tag]} info]
    (cond
      id [(get-fact-by-id id)]
      tag (let [first-tag (if (set? tag)
                            (first tag)
                            tag)
                objs (map get-fact-by-id (aget facts-by-tag first-tag))
                result (to-array (filter (fn [obj]
                                           (every? identity
                                                   (for [[k v] info
                                                         :let [obj-value (obj k)]]
                                                     (cond
                                                       (and (set? v) (set? obj-value)) (set/subset? v obj-value)
                                                       (set? obj-value) (obj-value v)
                                                       :else (= v (obj k))))))
                                         objs))]
            (if (> (count result) 0)
              result))
      :else (throw (js/Error. "Lookups must either contain an id or a tag")))))

(defn entity [info]
  (first (entities info)))

(defn property-updater [cur v]
  (cond
    (set? cur) (conj cur v)
    (and cur (not= cur v)) #{cur v}
    :else v))

(defn property-remover [cur v]
  (cond
    (and (set? cur) (>= (count cur) 2)) (disj cur v)
    (set? cur) (first (disj cur v))
    (= cur v) nil
    :else cur))

(defn remote-add-eavs! [context eavs]
  (let [inserts-string (reduce (fn [cur [e a v]]
                                 (if (nil? v)
                                   cur
                                   (str cur " " (query-string `(insert-fact! ~e ~a ~v)))))
                               ""
                               eavs)]
    (when-not (aget context "__inserts")
      (aset context "__inserts" (array)))
    (.push (aget context "__inserts") inserts-string)))

(defn remote-remove-eavs! [context eavs]
  (when (seq eavs)
    (let [removes (mapcat (fn [[e a v]]
                            (when-not (nil? v)
                              (let [sym (gensym 'tick)]
                                (query-string `(query [](fact-btu ~e ~(name a) ~v :tick ~sym)
                                        (remove-by-t! ~sym))))))
                        eavs)
          removes-subquery (reduce str "" removes)]
      (when (seq removes)
        (when-not (aget context "__removes")
          (aset context "__removes" (array)))
        (.push (aget context "__removes") removes-subquery)))))

(defn locally-add-eavs! [context eavs]
  (doseq [[e a v] eavs
          :let [obj (or (aget facts-by-id e) {:id e})
                a (if-not (keyword? a)
                    (keyword a)
                    a)]]
    (aset facts-by-id e (update-in obj [a] property-updater v))
    (when (= :name a)
      (swap! entity-name-pairs conj [e v]))
    (when (= :tag a)
      (doseq [tag (if (set? v)
                    v
                    #{v})]
        (aset facts-by-tag tag (if-let [cur (aget facts-by-tag tag)]
                                 (conj cur e)
                                 #{e}))))))

;; TODO: this will leak objects that no longer have any properties
(defn locally-remove-eavs! [context eavs]
  (doseq [[e a v] eavs
          :let [obj (or (aget facts-by-id e) {:id e})
                a (if-not (keyword? a)
                    (keyword a)
                    a)]]
    (aset facts-by-id e (update-in obj [a] property-remover v))
    (when (= :name a)
      (swap! entity-name-pairs disj [e v]))
    (when (= :tag a)
      (doseq [tag (if (set? v)
                    v
                    #{v})]
        (aset facts-by-tag tag (if-let [cur (aget facts-by-tag tag)]
                                 (disj cur e)))))))

(defn add-eavs! [context eavs force-local]
  (if (and USE-SERVER? (not force-local))
    (do
      (when BE-STUPIDLY-OPTIMISTIC?
        (locally-add-eavs! context eavs))
      (remote-add-eavs! context eavs))
    (locally-add-eavs! context eavs)))

(defn remove-eavs! [context eavs force-local]
  (if (and USE-SERVER? (not force-local))
    (do
      (when BE-STUPIDLY-OPTIMISTIC?
        (locally-remove-eavs! context eavs))
      (remote-remove-eavs! context eavs))
    (locally-remove-eavs! context eavs)))

(defn make-transaction-context []
  (js-obj))

(defn commit-transaction [context]
  (let [inserts (aget context "__inserts")
        removes (aget context "__removes")
        final-query (str "(query [] \n"
                         inserts
                         "\n"
                         removes
                         ")")
        query-id (js/uuid)]
    (when (or (seq inserts) (seq removes))
      (println "******* TIME TO COMMIT! ********" (.now (.-performance js/window)))
      (println final-query)
      (send-query query-id final-query)
      (send-close query-id))))

(defn insert-facts! [context info]
  (let [id (if (symbol? (:id info))
             (or (aget context (name (:id info))) (let [new-id (js/uuid)]
                                                    (aset context (name (:id info)) new-id)
                                                    new-id))
             (or (:id info) (js/uuid)))]
    (when (or (LOCAL-ONLY-TAGS (:tag info))
              (if (coll? (:tag info))
                (first (filter LOCAL-ONLY-TAGS (:tag info)))))
      (swap! local-ids conj id))
    (add-eavs! context
               (for [[k v] (dissoc info :id)
                     :let [v (if (symbol? v)
                               (aget context (name v))
                               v)]]
                 [id k v])
               (@local-ids id)))
  context)

(defn remove-facts! [context info]
  (let [id (or (:id info) (throw (js/Error "remove-facts requires an id to remove from")))]
    (remove-eavs! context
                  (for [[k v] (dissoc info :id)]
                    [id k v])
                  (@local-ids id)))
  context)

(defn remove-entity! [context id]
  (let [obj (get-fact-by-id id)
        tags (:tag obj)]
    (aset facts-by-id id nil)
    (doseq [tag (if (set? tags)
                  tags
                  #{tags})]
      (aset facts-by-tag tag (if-let [cur (aget facts-by-tag tag)]
                               (disj cur id)))))
  context)

(defn update-state! [context grid-id key new-value]
  (let [grid-user-state (entity {:tag "grid-user-state" :grid-id grid-id})]
    (when-not (= (key grid-user-state) new-value)
      (when grid-user-state
        (remove-facts! context {:id (:id grid-user-state) key (key grid-user-state)}))
      (when-not (nil? new-value)
        (if-not grid-user-state
          (insert-facts! context {:id 'new-user-state :tag "grid-user-state" :grid-id grid-id key new-value})
          (insert-facts! context {:id (:id grid-user-state) key new-value}))))))

(defn get-state [grid-id key & [otherwise]]
  (or (key (entity {:tag "grid-user-state" :grid-id grid-id}))
      otherwise))

(defn clear-intermediates! [context grid-id]
  (let [intermediate-keys [:intermediate-property :intermediate-value :focus :autocomplete-selection]
        grid-user-state (entity {:tag "grid-user-state" :grid-id grid-id})]
    (when grid-user-state
      (remove-facts! context (select-keys grid-user-state (concat [:id] intermediate-keys))))))

(defn update-entity! [context entity-id update-map]
  (let [with-id (assoc update-map :id entity-id)
        keys-to-update (keys with-id)
        current-entity (entity {:id entity-id})
        ;; we want to filter out any keys that would add and remove the same value
        ;; since that's a no-op and also it can lead to writer loops
        valid-keys-to-update (filter (fn [cur-key]
                                       (or (= cur-key :id)
                                           (not= (get current-entity cur-key) (get update-map cur-key))))
                                     keys-to-update)
        current-values (select-keys current-entity valid-keys-to-update)]
    (println "******** UPDATING: " entity-id)
    (println current-values (select-keys with-id valid-keys-to-update))
    (when (seq current-values)
      (remove-facts! context current-values))
    (insert-facts! context (select-keys with-id valid-keys-to-update))))

(defn matching-names [partial-name]
  ;; TODO: how do we get the names?
  (let [all-names @entity-name-pairs]
    (seq (filter (fn [[entity name]]
                   (> (.indexOf name partial-name) -1))
                 all-names))))

(defn for-display [value]
  ;; check if this is an id that has a name
  (if-let [name (and value (:name (entity {:id value})))]
    name
    ;; otherwise just return the value
    (str value)))

;;---------------------------------------------------------
;; Global dom stuff
;;---------------------------------------------------------

(defonce global-dom-state (atom {}))

(defn prevent-default [event]
  (.preventDefault event))

(defn global-mouse-down []
  (@global-dom-state :mouse-down))

(defn global-dom-init []
  (.addEventListener js/window "mousedown"
                     (fn [event]
                       (swap! global-dom-state assoc :mouse-down true)))

  (.addEventListener js/window "mouseup"
                     (fn [event]
                       (swap! global-dom-state assoc :mouse-down false)))
  (.addEventListener js/window "keydown"
                     (fn [event]
                       (let [target-node-name (.-nodeName (.-target event))
                             ignore-names #{"INPUT", "TEXTAREA"}]
                         (when-not (ignore-names target-node-name)
                           (prevent-default event))))))

(defn focus-once [node elem]
  (when-not (.-focused node)
    (set! (.-focused node) true)
    (.focus node)))

(defn auto-focus [node elem]
  (.focus node))

;;---------------------------------------------------------
;; Init
;;---------------------------------------------------------

(defn init []
  (when (not @renderer)
    (reset! renderer (new js/Renderer))
    (.appendChild (.-body js/document) (.-content @renderer))
    (global-dom-init)
    (websocket-init))
  (render))
