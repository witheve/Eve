(ns aurora.editor.core)

(def cur-env (atom nil))

(def aurora-state (atom {:cur-page nil
                         :pages []}))

(def state (atom {:program {:name "Incrementer"
                            :statements []}
                  :editor {}
                  :matcher {}}))
