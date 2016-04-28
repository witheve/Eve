(ns ui.renderer)

(defn glom [renderer facts]
  (reduce (fn [elems [elem-id attribute value]]
            (let [elem (get elems elem-id (js-obj "elem-id" elem-id))]
              (aset elem attribute value)
              (assoc elems elem-id elem))) {} facts))

(defn insert-sorted [parent child]
  (let [children (.-children parent)
        cnt (.-length children)
        target-ix (or (aget child "ix") 0)]
    (if (or (zero? cnt) (< (aget (aget children (dec cnt)) "ix") target-ix))
      (.appendChild parent child)
      ;; @NOTE: This is a linear scan for simplicity, if it's slow it can be replaced w/ a binary search
      (loop [ix 0]
        (println "####" ix)
        (let [cur (aget children ix)
              cur-ix (aget cur "ix")]
          (if (or (> cur-ix ix) (= (inc ix) cnt))
            (.insertBefore parent child cur)
            (recur (inc ix))))))))

(defn render [renderer diff]
  (let [root (:root @renderer)
        inserts (:inserts diff)
        removes (:removes diff)
        updates (glom renderer inserts)]

    (swap! renderer update-in [:elems]
           #(as-> %1 elems
              ;; Handle attribute and element removal (elements removed when no bound attributes remain to support them)
              ;; @NOTE: 9in the future a pre-processing phase can rectify these with updates for speed
              (reduce (fn [elems [elem-id attribute value]]
                        (when-let [elem (get elems elem-id)]
                          (condp = attribute
                            "tag" (throw (js/Error. "@FIXME: This needs to do something sane."))
                            "parent" (do
                                       (-> elem .-parentElement .removeChild)
                                       (insert-sorted root elem))
                            "textContent" (aset elem "textContent" js/undefined)

                            (.removeAttribute elem attribute))
                          (let [bound-props (aget elem "_bound-props")
                                prop-ix (.indexOf bound-props attribute)]
                            (when (= prop-ix -1)
                              (throw (js/Error. (str "Cannot remove property '" attribute "' that isn't bound"))))

                            (.splice bound-props prop-ix 1)
                            (if (and (= (.-length bound-props) 1) (not (contains? updates elem-id)))
                              (do
                                (-> elem .-parentElement .removeChild)
                                (dissoc elems elem-id elem))
                              elems))))
                      elems removes)

              ;; Preprocessing phase to ensure that all elements and their parents are created
              ;; @NOTE: If this is a perf issue it can be inlined into the next step, but doing it separately
              ;; yields cleaner code
              (reduce (fn [elems [elem-id attrs]]
                        (let [tag (or (aget attrs "tag") "div")
                              parent (aget attrs "parent")
                              ix (or (aget attrs "ix") 0)
                              parent-elem (when parent
                                            (or (get elems parent)
                                                (let [p (get updates parent)
                                                      tag (or (aget p "tag") "div")
                                                      ix (or (aget p "ix") 0)
                                                      parent-elem (.createElement js/document tag)]
                                                  (aset parent-elem "_bound-props" (array))
                                                  (aset parent-elem "ix" ix)
                                                  parent-elem)))
                              elem (or (get elems elem-id)
                                       (let [elem (.createElement js/document tag)]
                                         (aset elem "_bound-props" (array))
                                         (aset elem "ix" ix)
                                         elem))]
                          (if parent
                            (assoc elems parent parent-elem elem-id elem)
                            (assoc elems elem-id elem))))
                      elems updates)

              (reduce (fn [elems [elem-id attrs]]
                        (println "ELEMS IS" (clj->js elems))
                        (let [tag (aget attrs "tag")
                              parent (aget attrs "parent")
                              ix (or (aget attrs "ix") 0)
                              keys (.keys js/Object attrs)
                              elem (get elems elem-id)
                              bound-props (aget elem "_bound-props")]
                          ;; @FIXME: lack of parenting is due to elem already existing now.

                          (.apply (.-push bound-props) bound-props keys)

                          (when parent
                            (println "parenting" elem "to" parent "(" (get elems parent) ")")
                            (insert-sorted (get elems parent) elem))

                          (doseq [attr (vec keys)]
                            (condp = attr
                              "tag" nil
                              "parent" nil
                              "textContent" (aset elem "textContent" (aget attrs attr))
                              (.setAttribute elem attr (aget attrs attr))))
                          (assoc elems elem-id elem)))
                      elems updates)))))

(defn make-renderer [root]
  (atom {:root root :elems {}}))
