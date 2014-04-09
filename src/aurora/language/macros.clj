(remove-ns 'aurora.language.macros)

(ns aurora.language.macros)

(defmacro deffact [name madlib&keys]
  `(do
     (def ~name (aurora.language/fact-shape ~madlib&keys))
     (defn ~(symbol (str "->" name)) [& args#]
       (aurora.language/fact ~name (.-arr args#)))))

(defn op [expr]
  (if (seq? expr)
    (first expr)
    :pattern))

(defn check-expr [expr]
  (case (op expr)
    :pattern nil
    >ed (assert (= 2 (count expr)) (pr-str expr))
    +ed (assert (= 2 (count expr)) (pr-str expr))
    -ed (assert (= 2 (count expr)) (pr-str expr))
    ? (assert (= 2 (count expr))
              (pr-str expr))
    = (assert (and (= 3 (count expr))
                   (symbol? (nth expr 1)))
              (pr-str expr))
    set (assert (and (>= (count expr) 3)
                     (symbol? (nth expr 1))
                     (vector? (nth expr 2))
                     (mapv check-expr (nthnext expr 3)))
                (pr-str expr))
    > (assert (= 2 (count expr)) (pr-str expr))
    + (assert (= 2 (count expr)) (pr-str expr))
    - (assert (= 2 (count expr)) (pr-str expr))
    >s (assert (= 2 (count expr)) (pr-str expr))
    +s (assert (= 2 (count expr)) (pr-str expr))
    -s (assert (= 2 (count expr)) (pr-str expr))))

(defmacro rule [& exprs]
  (mapv check-expr exprs)
  `(macroless-rule '~exprs))
