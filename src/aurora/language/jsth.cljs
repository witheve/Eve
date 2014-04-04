(ns aurora.language.jsth
  (:require [clojure.string :refer [join split-lines]])
  (:require-macros [aurora.macros :refer [check deftraced]]))

(def munge-map
  {"-" "_"
   " " "_SPACE_"
   "." "_DOT_"
   ":" "_COLON_"
   "+" "_PLUS_"
   ">" "_GT_"
   "<" "_LT_"
   "=" "_EQ_"
   "~" "_TILDE_"
   "!" "_BANG_"
   "@" "_CIRCA_"
   "#" "_SHARP_"
   "'" "_SINGLEQUOTE_"
   "\"" "_DOUBLEQUOTE_"
   "%" "_PERCENT_"
   "^" "_CARET_"
   "&" "_AMPERSAND_"
   "*" "_STAR_"
   "|" "_BAR_"
   "{" "_LBRACE_"
   "}" "_RBRACE_"
   "[" "_LBRACK_"
   "]" "_RBRACK_"
   "/" "_SLASH_"
   "\\" "_BSLASH_"
   "?" "_QMARK_"})

(def munge-regexes
  (into-array
   (for [find (keys munge-map)]
     (js/RegExp. (str "\\" find) "gi"))))

(def munge-replaces
  (into-array (vals munge-map)))

;; TODO doesn't handle reserved names or namespaced symbols
(defn munge-part [part]
  (areduce munge-regexes i part part
           (.replace part (aget munge-regexes i) (aget munge-replaces i))))

(defn munge [sym]
  (let [parts (.split (name sym) ".")
        last-part (.pop parts)]
    (.push parts (munge-part last-part))
    (.join parts ".")))

(declare expression->string statement->string)

(defn head [x] [x]
  (try (name (first x)) (catch :default _ nil)))

(defn indent [lines]
  (join "\n" (for [line (split-lines lines)] (str "  " line))))

(deftraced data->string [x] [x]
   (cond
    (nil? x) "null"
    (or (true? x) (false? x)) (str x)
    (number? x) (str x)
    (string? x) (pr-str x)
    (vector? x) (str "[" (join ", " (map expression->string x)) "]")
    (map? x) (do  ;; TODO emit objects
               (str "{" (join ", " (for [[k v] x]
                                     (str (expression->string k) ": " (expression->string v)))) "}"))
    :else (check false)))

(deftraced name->string [x] [x]
  (check (symbol? x))
  (munge x))

(deftraced var->string [x] [x]
   (cond
    (symbol? x) (name->string x)
    (= "get!" (head x)) (do (check (= (count x) 3))
                          (str (expression->string (nth x 1)) "[" (expression->string (nth x 2)) "]"))
    (= ".." (head x)) (do (check (= (count x) 3))
                        (str (expression->string (nth x 1)) "." (name->string (nth x 2))))
    :else (check false)))

(deftraced expression->string [x] [x]
  (cond
   (or (symbol? x) (#{"get!" ".."} (head x))) (var->string x)
   (or (nil? x) (true? x) (false? x) (number? x) (string? x) (vector? x) (map? x)) (data->string x)
   (= "=" (head x)) (do (check (= (count x) 3))
                      (str (expression->string (nth x 1)) " == " (expression->string (nth x 2))))
   (= "==" (head x)) (do (check (= (count x) 3))
                       (str (expression->string (nth x 1)) " === " (expression->string (nth x 2))))
   (= "not" (head x)) (do (check (= (count x) 2))
                        (str "!(" (expression->string (nth x 1)) ")"))
   (= "?" (head x)) (do (check (= 4 (count x)))
                        (str "(" (expression->string (nth x 1)) ") ? (" (expression->string (nth x 2)) ") : (" (expression->string (nth x 3)) ")"))
   (= "fn" (head x)) (do (check (= (count x) 3)
                                (vector? (nth x 1)))
                       (str "(function (" (join ", " (map name->string (nth x 1))) ") {\n"
                            (indent (statement->string (nth x 2))) "\n"
                            "})"))
   (= "new" (head x)) (do (check (= (count x) 2))
                        (str "new " (expression->string (nth x 1))))
   (= "js*" (head x)) (do (check (= (count x) 2))
                        (nth x 1))
   (seq? x) (do (check (>= (count x) 1))
              (let [f (expression->string (nth x 0))
                    args (map expression->string (rest x))]
                (str f "(" (join ", " args) ")")))
   :else (check false)))

(deftraced statement->string [x] [x]
  (cond
   (= "do" (head x)) (join "\n" (map statement->string (rest x)))
   (= "if" (head x)) (do (check (#{3 4} (count x)))
                       (str "if (" (expression->string (nth x 1)) ") {\n"
                            (indent (statement->string (nth x 2))) "\n"
                            "}"
                            (when (= (count x) 4)
                              (str "else {\n"
                                   (indent (statement->string (nth x 3))) "\n"
                                   "}"))))
   (= "let!" (head x)) (do (check (= (count x) 3))
                         (str "var " (name->string (nth x 1)) " = " (expression->string (nth x 2)) ";"))
   (= "set!" (head x)) (do (check (= (count x) 3))
                         (str (var->string (nth x 1)) " = " (expression->string (nth x 2)) ";"))
   (= "fn" (head x)) (do (check (= (count x) 4)
                                (vector? (nth x 2)))
                       (str "function " (name->string (nth x 1)) "(" (join ", " (map name->string (nth x 2))) ") {\n"
                            (indent (statement->string (nth x 3))) "\n"
                            "}"))
   (= "throw" (head x)) (do (check (= (count x) 2))
                          (str "throw " (expression->string (nth x 1)) ";"))
   (= "try" (head x)) (do (check (#{2 3} (count x)))
                        (str "try {\n"
                             (indent (statement->string (nth x 1))) "\n"
                             "}"
                             (when (= 3 (count x))
                               (let [catch (nth x 2)]
                                 (check (= (count catch) 3)
                                        (= "catch" (head catch)))
                                 (str " catch (" (name->string (nth catch 1)) ") {\n"
                                      (indent (statement->string (nth catch 2))) "\n"
                                      "}")))))
   (= "return" (head x)) (do (check (= (count x) 2))
                            (str "return " (expression->string (nth x 1)) ";"))
   :else (expression->string x)))
