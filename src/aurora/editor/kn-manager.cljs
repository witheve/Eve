(ns aurora.editor.kn-manager
  (:require [aurora.language :as language :refer [knowledge]]
            [aurora.syntax :as syntax]
            [aurora.runtime :as runtime :refer [env prep-compiled]]))

(def kns (js-obj))

(defn get-kn [name]
  (or (aget kns name)
      (let [e (env)]
        (aset kns name e)
        (syntax/know e "defaults" #js ["defaults"] #js [""])
        e)))

(defn pause [name]
  (let [cur (get-kn name)]
    (aset (.-state cur) "paused" true)))

(defn unpause [name]
  (let [cur (get-kn name)]
    (aset (.-state cur) "paused" false)
    (js/setTimeout (fn []
                     (runtime/re-run cur))
                   0)))

(defn inject [name indexes clear?]
  (let [kn (get-kn name)]
    (dotimes [x (alength indexes)]
      (let [cur (aget indexes x)
            ix-name (aget cur 0)
            order (aget cur 1)
            facts (aget cur 2)
            remote-index (.get-or-create-index kn "know" ix-name order)]
        (when clear?
          (.clear-facts kn "know" ix-name))
        (.directly-insert-facts! kn "know" ix-name order facts)))))

(defn compile [name]
  (let [kn (get-kn name)
        compiled (language/compile kn)]
    (aset (.-state kn) "watchers" [(runtime/create-react-renderer ".program-preview")])
    (prep-compiled compiled)
    (aset (.-state kn) "compiled" compiled)
    kn))

(defn inject-and-compile [name indexes]
  (pause name)
  (inject name indexes true)
  (compile name)
  (println "compiled, running")
  (unpause name))

(defn extract-compile-ixs [kn]
  #js [#js ["clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"] (.keys (.get-or-create-index kn "know" "compiled clauses" #js ["rule-id" "when|know|remember|forget" "clause-id" "name"]))]
       #js ["clause-fields" #js ["clause-id" "constant|variable" "key" "val"] (.keys (.get-or-create-index kn "know" "compiled clause-fields" #js ["clause-id" "constant|variable" "key" "val"]))]])

(defn watcher [kn]
  (let [ext (.keys (.get-or-create-index kn "know" "control external" #js ["action" "id"]))]
    (doseq [e ext
            :let [action (aget e 0)
                  id (aget e 1)]]
      (condp = action
        "compile" (inject-and-compile id (extract-compile-ixs kn))
        "pause" (pause id)
        "start" (unpause id))
      (println "control: " e))))
