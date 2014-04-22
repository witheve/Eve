(ns aurora.editor.core)

(def cur-env (atom nil))

(def aurora-state (atom {:cur-page nil
                         :pages []}))

(def state (atom {:program {:name "Incrementer"
                            :statements []}
                  :editor {}
                  :matcher {}}))

(comment
  (add-watch cur-env :facts #(prn :watch-facts (aurora.language/get-facts-compat (:kn @cur-env) :known|pretended)))
  (add-watch cur-env :facts #(prn :watch-stats (map vector (range) (:node->stats (:kn @cur-env)))))
  (aurora.language/get-facts-compat (:kn @cur-env) :known|pretended)
  (aurora.runtime.core/handle-feed cur-env nil {:force true})
  (aurora.editor.clauses/inject-compiled)
  (add-watch cur-env :watch-stats
             (fn [_]
               (let [node->stats (:node->stats (:kn @cur-env))]
                 (dotimes [node (count node->stats)]
                   (when-let [stats (nth node->stats node)]
                     (when-let [dupes (aget stats "dupes")]
                       (when (> dupes 0)
                         (prn :dupes node dupes (get-in @cur-env [:kn :plan :node->flow node])))))))))

  (assoc (aurora.language/FilterMap. #{} #{}))
  )
