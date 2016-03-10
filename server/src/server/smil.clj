(ns server.smil
  (:require [clojure.pprint :refer [pprint]]))

(def REMOVE_FACT 5)

(defn primitive? [op] nil)

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

;; Flatten vecs (multi-returns) in the given body
(defn congeal-body [body]
  (vec (reduce #(if (vector? %2)
             (into %1 %2)
             (conj %1 %2))
          []
          body)))

(defn as-query [expr]
  (if (and (seq? expr) (= (first expr) 'query))
    expr
    ('query
     ('= 'return expr))))

(defn assert-queries [body]
  (when (not-every? #(and (seq? %1) (= (first %1) 'query)) body) ;; @NOTE: Should this allow unions/chooses as well?
    (throw (Exception. "All union/choose members must be queries")))
  body)

;; :args - positional arguments
;; :kwargs - keyword arguments
;; :rest - remaining arguments
;; :optional - arguments which may not be specified
(def schemas {
              ;; Special forms
              'fact nil
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
              'fact-btu {:args [:entity :attribute :value :bag] :optional #{:entity :attribute :value :bag}}
              'context {:kwargs [:bag :tick] :rest :body :optional #{:bag :tick :body}}})

(defn parse-args [schema body]
  ;; 1. If a keyword has been shifted into :kw
  ;;    A. If the value is also keyword, :kw is an implicit var binding
  ;;    B. Else :kw is mapped manually to the value
  ;; 2. If the value is a keyword, shift it into :kw and stop accepting positionals
  ;; 3. If we haven't exhausted our positionals, shift a positional to map to the value
  ;; 4. If the form accepts a rest parameter, shift the value onto the rest list
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
          {:args {} :kw nil :position (count (:args schema))} body)))

(defn validate-args [schema args]
  (let [params (into (:args schema) (:kwargs schema))
        params (if (:rest schema) (conj params (:rest schema)) params)
        optional (:optional schema)
        required (if optional (into [] (filter #(not (optional %1)) params)) params)]
    (and
     (every? (set params) (keys args))      ; Every argument is a valid parameter
     (every? (set (keys args)) required)))) ; Every required parameter is an argument

(defn parse-define [body]
  ;; 1. If we've started parsing the body, everything else gets pushed into the body
  ;; 2. If there's an existing symbol in :sym (alias)
  ;;    A. If the value is a vec, shift the pair into the :header
  ;;    B. Throw (Aliases must be followed by their exported variables)
  ;; 3. If the value is a symbol, shift it into :sym
  ;; 4. Shift the value into the body
  (select-keys
   (reduce
    #(merge-state
      %1
      ;; If we've already entered the body, no more headers can follow
      (if (> (count (:body %1)) 0)
        {:body [%2]}
        ;; If we've already snatched an alias, it must be followed by a vec of vars
        (if (:sym %1)
          (if (vector? %2)
            {:sym nil :header [(:sym %1) %2]}
            (throw (Exception.
                    (str "Implication alias " (:sym %1) " must be followed by a vec of exported variables"))))
          ;; If our state is clear we can begin a new header (symbol) or enter the body (anything else)
          (if (symbol? %2)
            {:sym %2}
            ;; If no headers are defined before we try to enter the body, that's a paddlin'
            (if (> (count (:header %1)) 0)
              {:body [%2]}
              (throw (Exception. "Implications must specify at least one alias")))))))
    {:header [] :body [] :sym nil} body)
   [:header :body]))

(defn parse-fact [body]
  ;; 1. Shift the first expr into :entity
  ;; 2. If there's an existing value in :attr (attribute)
  ;;    A. If the value is also keyword, :attr is an implicit var binding
  ;;    B. Else shift :attr and the value into an [:entity :attr value] triple in :facts
  ;; 3. Shift the value into :attr
  (select-keys
   (reduce
    #(merge-state
      %1
      (if (:attr %1)
        (if (keyword? %2)
          ;; Implicit variable; sub in a symbol of the same name, set the next :attr
          {:attr %2 :facts [[(:entity %1) (name (:attr %1)) (symbol (name (:attr %1)))]]}
          ;; Normal KV pair; use the :attr
          {:attr nil :facts [[(:entity %1) (name (:attr %1)) %2]]})
        ;; Shift the next value into  :attr
        (if (keyword? %2)
          {:attr %2}
          (throw (Exception.
                  (str "Invalid attribute " %2 "attributes must be keyword literals. Use fact-btu for free attributes"))))))
    {:entity (first body) :facts [] :attr nil}
    (rest body))
   [:entity :facts]))

(defn expanded [args]
  (reduce-kv #(assoc %1 %2 (if (vector? %3) (into [] (map expand %3)) (expand %3))) {} args))

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
                       (when-not valid (throw (Exception. (str "Invalid arguments for form " sexpr))))
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
                         query (cons 'query (congeal-body (map expand (:body args))))
                         union (concat '(union) [(:params args)] (assert-queries (congeal-body (map expand (:members args)))))
                         choose (concat '(choose) [(:params args)] (assert-queries (congeal-body (map expand (:members args)))))
                         not (concat '(not) [(expand (:expr args))])
                         context (cons 'context (splat-map (expanded args)))

                         ;; Default
                         (cons op (splat-map (expanded args)))
                         ))
        (= op 'define!) (let [args (parse-define body)]
                          (concat '(define!) (:header args) (into [] (congeal-body (map expand (:body args))))))
        (= op 'fact) (let [args (parse-fact body)]
                       (vec (map #(expand (cons 'fact-btu %1)) (:facts args))))
        ;; This check can be inlined into schemas if we fold in the primitive schemas
        (primitive? op) (throw (Exception. "@TODO: Implement me!")) ; Need schemas for primitive parameters
        :else (throw (Exception. (str "Unknown operator '" op "'")))))
    (sequential? expr)
    (map expand expr)
    :else expr))

(defn test-sm [sexpr]
  (println "----[" sexpr "]----")
  (let [op (first sexpr)
        body (rest sexpr)
        schema (schemas op)
        args (cond
               schema (parse-args schema body)
               (= op 'define!) (parse-define body))
        valid (or (and (not schema) args) (validate-args schema args))]
    (printf "op %s\n - schema %s\n - args %s\n - valid %s\n" op schema args valid)
    (when valid (pprint (expand sexpr)))))

;; Test cases
;; (test-sm '(define! foo [a b] (fact bar "age" a) (fact a "tag" bar)))
;; (test-sm '(query (insert-fact! [a b c] [1 2 3])))
;; (test-sm '(union [person] (query (not (fact :value person)) (fact person "company" "kodowa"))))
;; (test-sm '(choose [a] (query (fact a)) (query (fact :attribute a))))
