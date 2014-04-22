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
  (aurora.language/get-facts-compat (:kn @cur-env) :known|pretended)
  (aurora.runtime.core/handle-feed cur-env nil {:force true})
  (aurora.editor.clauses/inject-compiled)
  )
