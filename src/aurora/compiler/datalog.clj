(ns aurora.compiler.datalog
  (:require [aurora.compiler.match :as match]
            [aurora.macros :refer [check fnk]]))

(defn query->cljs [clauses body]
  (let [projects (for [[key val] clauses
                       :when (not (#{:when} key))]
                   key)
        vars (into [] (match/vars projects))
        filter-fnks (for [[key val] clauses
                          :when (= :when key)]
                      `(fnk ~vars ~val)) ;; TODO capture vars correctly for graph dependencies
        map-fnk `(fnk ~vars ~body)]
    `(query* '~(into [] projects) ~(into [] filter-fnks) ~map-fnk)))

(defmacro query [clauses body]
  (query->cljs (partition 2 clauses) body))

(defn rule->cljs [clauses body]
  (let [projects (for [[key val] clauses
                       :when (not (#{:when} key))]
                   key)
        vars (into [] (match/vars projects))
        filter-fnks (for [[key val] clauses
                          :when (= :when key)]
                      `(fnk ~vars ~val)) ;; TODO capture vars correctly for graph dependencies
        assert-fnks (for [[key val] body
                          :when (= key '+)]
                      `(fnk ~vars ~val))
        retract-fnks (for [[key val] body
                           :when (= key '-)]
                       `(fnk ~vars ~val))]
    `(rule* '~(into [] projects) ~(into [] filter-fnks) ~(into [] assert-fnks) ~(into [] retract-fnks))))

(defmacro rule [clauses & body]
  (rule->cljs (partition 2 clauses) (partition 2 body)))
