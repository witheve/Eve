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
  (aurora.runtime.ui/on-bloom-tick (:kn @cur-env) (:feeder-fn @cur-env))
  (aurora.runtime.core/quiescience (:kn @cur-env) @cur-env [])
  (aurora.language/fixpoint! (:kn @cur-env))
  (add-watch cur-env :watch-stats
             (fn [_]
               (let [node->stats (:node->stats (:kn @cur-env))]
                 (dotimes [node (count node->stats)]
                   (prn :stats node (aget node->stats node) (get-in @cur-env [:kn :plan :node->flow node])))
                 (prn :total-in (reduce + (for [node (range (count node->stats))] (aget node->stats node "count-in"))))
                 (prn :total-out (reduce + (for [node (range (count node->stats))] (aget node->stats node "count-out")))))))

  (assoc (aurora.language/FilterMap. #{} #{}))

  (aurora.language/get-facts-compat (:kn @cur-env) :forgotten)
  (def x (first (aurora.language/get-facts-compat (:kn @cur-env) :known|pretended)))
  (aurora.language/add-facts (:kn @cur-env) :forgotten (.-shape x) [x])
  (runtime/handle-feed cur-env [] {})
  (aurora.editor.clauses/compile-state)
  )
