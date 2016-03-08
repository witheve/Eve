(ns server.smir
  (:require [clojure.pprint :refer [pprint]]))

(def REMOVE_FACT 5)

(defn primitive? [op])

(defn tap [x & [label]]
  (println (str (or label "") " " x))
  x)

(defn merge-state [a b]
  (if (sequential? a)
    (into a b)
    (if (map? a)
      (merge-with merge-state a b)
      b)))

(defn splat-map [m]
  (reduce-kv #(into %1 [%2 %3]) [] m))

;; :args - positional arguments
;; :kwargs - keyword arguments
;; :rest - remaining arguments
;; :optional - arguments which may not be specified
(def schemas {
              ;; Special forms
              'eav nil
              'define! nil ;; @NOTE: define! is a special form due to multiple names...
              
              ;; Macros
              'insert-fact! {:rest :facts}
              'remove-by-t! {:args [:tick]}
              'if {:args [:cond :then :else]}

              ;; native forms
              'insert-fact-btu! {:args [:entity :attribute :value :bag] :optional #{:bag}} ; bag can be inferred in SMIR
              'query {:rest :body}
              'union {:args [:params] :rest :members}
              'choose {:args [:params] :rest :members}
              'not {:args [:expr]}
              'fact {:args [:entity :attribute :value :bag] :optional #{:entity :attribute :value :bag}}
              'context {:kwargs [:bag :tick] :rest :body :optional #{:bag :tick :body}}
          })

(defn parse-args [schema body]
  ;; 1. If a keyword has been shifted into :kw
  ;;    A. If the value is also keyword, :kw is an implicit var binding
  ;;    B. Else :kw is mapped manually to the value
  ;; 2. Else if the value is a keyword, shift it into :kw and stop accepting positionals
  ;; 3. Else if we haven't exhausted our positionals, shift a positional to map to the value
  ;; 4. Else if the form accepts a rest parameter, shift the value onto the rest list
  (:args (reduce
          #(merge-state %1
                        (if (:kw %1) 
                          (if (keyword? %2)
                            ;; Implicit variable; sub in a symbol of the same name, set the next :kw
                            {:kw %2 :args {(:kw %1) (symbol (name (:kw %1)))}}
                            ;; Normal KV pair; use the :kw
                            {:kw nil :args {(:kw %1) %2}})
                          (if (keyword? %2)
                            ;; Manual keyword, set the next :kw and cease being positional
                            {:position 0 :kw %2}
                            (if-let [kw (get (:args schema) (- (count (:args schema)) (:position %1)) nil)]
                              ;; Positional value; use kw from (:args schema) and decrement (position
                              {:position (dec (:position %1)) :args {kw %2}}
                              (if (:rest schema)
                                ;; If a rest argument is specified, dump excess args into it
                                {:args {(:rest schema) [%2]}}
                                ;; Too many arguments without names, bail
                                (throw (Exception.
                                        (str "Too many positional arguments without a rest argument. Expected "
                                             (count (:args schema))))))))))
          {:args {} :position (count (:args schema))} body)))

(defn validate-args [schema args]
  (let [params (into (:args schema) (:kwargs schema))
        params (if (:rest schema) (conj params (:rest schema)) params)
        optional (:optional schema)
        required (if optional (into [] (filter #(not (optional %1)) params)) params)]
    (printf "optional %s\nrequired %s\n" optional required)
    (and
     (every? (set params) (keys args))      ; Every argument is a valid parameter
     (every? (set (keys args)) required)))) ; Every required parameter is an argument

(defn as-query [expr]
  (if (and (seq? expr) (= (first expr) 'query))
    expr
    ('query
     ('= 'return expr))))

(defn expanded [args]
  (reduce-kv #(assoc %1 %2 (expand %3)) {} args)) 

;; Returns a hash of {:inline [form], :hoisted [form1, form2, ...formN]}
;; The :inline form (if present) should be substituted in place
;; Any :hoisted forms should be moved to the top level of the body.
;; @TODO: sub-expansions need to get flattened into bodies.
(defn expand [expr]
  (cond
    (seq? expr)
    (let [sexpr expr
          op (first sexpr)
          body (rest sexpr)]
      (cond
        (schemas op) (let [schema (schemas op)
                           args (parse-args schema body)
                           valid (validate-args schema args)]
                                        ; Switch on op for special handling
                       (case op
                         ;; Macros
                         insert-fact! (vec (map #(expand (cons 'insert-fact-btu! %1)) (:facts args)))
                         remove-by-t! (expand ('insert-fact-btu! (:tick args) REMOVE_FACT nil))
                         if (let [then (as-query (:then args))
                                   then ('query (:cond args) (rest then))
                                   else (as-query (:else args))]
                               ('choose ['return]
                                        then
                                        else))
                         
                         ;; Native forms
                         insert-fact-btu! (cons 'insert-fact-btu! (splat-map (expanded args)))
                         query (cons 'query (map expand (:body args)))
                         union (cons 'union (map expand (:members args)))
                         choose (cons 'choose (map expand (:members args)))
                         not (cons 'not (expand (:expr args)))
                         fact (cons 'fact (splat-map (expanded args)))
                         context (cons 'context (splat-map (expanded args)))))
        (= op 'define!) (let [])
        (= op 'eav) (let [])
        ;; This check can be inlined into schemas if we fold in the primitive schemas
        (primitive? op) (throw (Exception. "@TODO: Implement me!")) ; Need schemas for primitive parameters
        :else (throw (Exception. (str "Unknown operator '" op "'")))))
    (sequential? expr)
    (map expand expr)
    :else expr))

(defn test-sm [sexpr]
  (let [op (first sexpr)
        body (rest sexpr)
        schema (schemas op)
        args (parse-args schema body)
        valid (validate-args schema args)]
    (printf "op %s\n - schema %s\n - args %s\n - valid %s" op schema args valid)))
    
  
