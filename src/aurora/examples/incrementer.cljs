(ns aurora.examples.incrementer
  (:require [aurora.btree :refer [tree iterator least greatest key-lt key-lte key-gt key-gte key-compare key=]]
            [aurora.join :refer [magic-iterator join-iterator all-join-results pretend-tree transform constant-filter fixpoint-tick fixpont-inner infinirator reconcile context]])
  (:require-macros [aurora.macros :refer [typeof ainto perf-time]]))



(defn index [env n]
  (aget (aget env "indexes") (name n)))

(defn init []
  (let [env #js {}
        indexes #js {:clicked (pretend-tree 10)
                     :counter (tree 10)
                     :elem (pretend-tree 10)
                     :elem-child (pretend-tree 10)
                     :elem-attr (pretend-tree 10)
                     :elem-text (pretend-tree 10)
                     :elem-style (pretend-tree 10)
                     :elem-event (pretend-tree 10)
                     :time (pretend-tree 10)}]
    (aset env "ctx" (context indexes))
    (aset env "indexes" indexes)
    env))

(defn click! [env elem]
  (.assoc! (index env :clicked) #js[elem] 0))

(defn init-counter [env]
  (.assoc! (index env :counter) #js [0] 0))

(defn draw [env]
  (let [itr1 (magic-iterator (index env :counter) #js [0])
        join-itr (join-iterator #js [itr1])]
    (transform (aget env "ctx") join-itr
               (fn [cur remember! forget! pretend!]
                 (pretend! "elem" #js [ "increment" "button"])
                 (pretend! "elem-child" #js [ "increment" "increment-0" 0])
                 (pretend! "elem-child" #js [ "increment" "increment-1" 1])
                 (pretend! "elem-text" #js [ "increment-0" "increment: "])
                 (pretend! "elem-text" #js [ "increment-1" (aget cur 0)])
                 (pretend! "elem-event" #js [ "increment" "onClick"])
                 )))
  )

(defn inc-clicked [env]
  (let [itr1 (magic-iterator (index env :clicked) #js [0 nil])
        itr2 (magic-iterator (index env :counter) #js [nil 0])
        filter (constant-filter 2 0 "increment")
        join-itr (join-iterator #js [itr1 itr2 filter])]
    (transform (aget env "ctx")
               join-itr
               (fn [cur remember! forget! pretend!]
                 (forget! "counter" #js [ (aget cur 1)])
                 (remember! "counter" #js [ (#(+ % 1) (aget cur 1))])
                 )))
  )


(defn run []
  (let [env (init)]
    (init-counter env)
    (click! env "increment")
    (fixpoint-tick env
                   (fn [env]
                     (draw env)
                     (inc-clicked env)))
    (aget env "indexes"))
  )

(comment

  (perf-time (dotimes [x 1000] (run)))
  (perf-time (run))


  )
