(ns aurora.core
  (:require [clojure.walk :as walk]
            [clojure.pprint :refer [pprint]]))

(eval '(+ 1 2))

(def env {:main :i5
          :items {:i0 [:diamond :spade :heart :club]
                  :i1 [:2 :3 :4 :5 :6 :7 :8 :9 :10 :j :q :k :a]
                  :i2 '(second :i0)
                  :i3 '(for [a :i0
                             b :i1]
                         [a b])
                  :i4 '(first :i3)
                  :i5 '[:div {:class (str (name (first :i4)) " value" (name (second :i4)))}]}})

(defn prep [env]
  (let [items (:items env)]
    (assoc env :items (zipmap (keys items) (walk/prewalk-replace items (vals items))))))

(defn run [env]
  (eval ((:main env) (-> env :items))))

(defn print-ret [v]
  (println (pprint v))
  v)

(def visualizer {:main :r1
                 :items {:r0 env
                         :r3 {'for {:desc "For each item"}
                              'second {:desc "Take the second"}
                              'first {:desc "Take the first"}
                              'pr-str {:desc "Print it"}}
                         :r1 '[:ul :r2]
                         :r2 '(for [x ((quote :r0) :items)]
                                [:li [:pre (-> x second)]])
                         :r4 '(walk/prewalk-replace :r3 :r1)}})

visualizer

(defn run-prog [env]
  (-> env
      (prep)
      (print-ret)
      (run)))

(prep visualizer)
(run-prog visualizer)

(-> {:main :i5
     :items {:i0 [:diamond :spade :heart :club]
             :i1 [:2 :3 :4 :5 :6 :7 :8 :9 :10 :j :q :k :a]
             :i2 '(second :i0)
             :i3 '(for [a :i0
                        b :i1]
                    [a b])
             :i4 '(first :i3)
             :i5 '[:div {:class (str (name (first :i4)) " value" (name (second :i4)))}]}}
    (prep)
    (print-ret)
    (run))
