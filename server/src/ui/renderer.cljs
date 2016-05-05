(ns ui.renderer)

(def empty-obj (js-obj))

(defn glom [renderer inserts removes]
  (as-> {} updates
    (reduce (fn [elems [elem-id attribute value]]
              (let [elem (get elems elem-id (js-obj "inserts" (js-obj)))]
                (aset elem "inserts" attribute value)
                (assoc elems elem-id elem)))
            updates inserts)
    (reduce (fn [elems [elem-id attribute value]]
              (let [elem (get elems elem-id (js-obj))]
                (when-not (aget elem "removes")
                  (aset elem "removes" (array)))
                ;; @NOTE: If any props still need partial removal on update add them into a condp as the else clause
                (when-not (aget elem "inserts" attribute)
                  (.push (aget elem "removes") attribute))
                (assoc elems elem-id elem)))
            updates removes)))

(defn insert-sorted [parent child]
  (let [children (.-children parent)
        cnt (.-length children)
        target-ix (or (int (.getAttribute child "ix")) 0)
        greatest-ix (when-not (zero? cnt) (or (int (.getAttribute (aget children (dec cnt)) "ix")) 0))]
    ;(.log js/console "INSERT " child "into" parent "at" target-ix "vs" greatest-ix "of" cnt)
    (if (or (zero? cnt) (>= target-ix greatest-ix))
      (.appendChild parent child)
      ;; @NOTE: This is a linear scan for simplicity, if it's slow it can be replaced w/ a binary search
      (loop [ix 0]
        (let [cur (aget children ix)
              cur-ix (or (int (.getAttribute cur "ix")) 0)]
          (if (or (<= target-ix cur-ix) (= (inc ix) cnt))
            (.insertBefore parent child cur)
            (recur (inc ix)))))))
  child)

(defn replace-tag [elem tag]
  (if (= (.toLowerCase (.-tagName elem)) tag)
    elem
    (let [neue (.createElement js/document tag)
          bound-props (aget elem "_bound-props")
          children (.-children elem)]
      (doseq [i (range (.-length bound-props))]
        (let [prop (aget bound-props i)]
          (condp = prop
            "text" (aset neue "textContent" (aget elem "textContent"))
            "parent" nil
            "tag" nil
            (.setAttribute neue prop (.getAttribute elem prop)))))

      (while (not (zero? (.-length children)))
        (.appendChild neue (aget children 0)))

      (when-let [parent (.-parentElement elem)]
        (.removeChild parent elem)
        (insert-sorted parent neue))
      (aset neue "_bound-props" bound-props)
      neue)))

(defn set-property [elem attribute value]
  (aset elem attribute value)
  elem)

(defn initialize-elem [elems [elem-id updates]]
  (let [attrs (aget updates "inserts")
        parent (aget attrs "parent")
        elem (or (get elems elem-id)
                 (let [tag (or (aget attrs "tag") "div")
                       ix (aget attrs "ix")
                       elem (.createElement js/document tag)
                       bound-props (array)]
                   (aset elem "_bound-props" bound-props)
                   (when ix
                     (.setAttribute elem "ix" ix)
                     (.push bound-props "ix"))
                   elem))

        parent-elem (when parent
                      (or (get elems parent)
                          ;; @TODO: Make this smarter -- if the parent is in the same batch, have him ordered first.
                          (let [tag "div"
                                parent-elem (.createElement js/document tag)]
                            (aset parent-elem "_bound-props" (array))
                            parent-elem)))]
    (if parent
      (assoc elems parent parent-elem elem-id elem)
      (assoc elems elem-id elem))))

(defn update-attr [elems [elem-id updates]]
  (let [attrs (aget updates "inserts")
        removes (aget updates "removes")
        elem (get elems elem-id)
        bound-props (aget elem "_bound-props")
        keys (.keys js/Object attrs)
        cnt (.-length keys)]

    (doseq [attribute removes]
      (condp = attribute
        "tag" (throw (js/Error. "@FIXME: This needs to do something sane in the non element removal case."))
        "parent" (some-> (.-parentElement elem) (.removeChild elem))
        "text" (aset elem "textContent" js/undefined)
        (.removeAttribute elem attribute))
      (let [prop-ix (.indexOf bound-props attribute)]
        (when (= prop-ix -1)
          (throw (js/Error. (str "Cannot remove property '" attribute "' that isn't bound"))))
        (.splice bound-props prop-ix 1)))

    (if (zero? cnt)
      (if-not (zero? (.-length bound-props))
        elems
        (do
          (-> (.-parentElement elem) (.removeChild elem))
          (dissoc elems elem-id elem)))
      (let [elem (loop [elem elem
                        key-ix 0]
                   (let [attribute (aget keys key-ix)
                         value (aget attrs attribute)
                         elem (condp = attribute
                                "tag" (replace-tag elem value)
                                "parent" elem
                                "ix" elem
                                "text" (set-property elem "textContent" value)
                                (do (.setAttribute elem attribute value)
                                    elem))]
                     (.push bound-props attribute)
                     (if (< (inc key-ix) cnt)
                       (recur elem (inc key-ix))
                       elem)))]

        (when (aget attrs "ix")
          (.setAttribute elem "ix" (aget attrs "ix"))
          (when (and (.-parentElement elem) (not (aget attrs "parent")))
            (insert-sorted (.-parentElement elem) elem)))
        (when (aget attrs "parent")
          (insert-sorted (get elems (aget attrs "parent")) elem))

        (assoc elems elem-id elem)))))

(defn render [renderer diff]
  (let [root (:root @renderer)
        {inserts :inserts removes :removes} diff
        updates (glom renderer inserts removes)]

    (swap! renderer update-in [:elems]
           #(as-> %1 elems
              ;; Preprocessing phase to ensure that all elements and their parents are created
              (reduce initialize-elem elems updates)
              ;; Handle adding/removing/updating elements and their attributes
              (reduce update-attr elems updates)
              ))))

(defn make-renderer [root]
  (atom {:root root :elems {"root" root}}))
