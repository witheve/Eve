(ns aurora.jsth
  (:require [clojure.string :refer [join split-lines]]
            aurora.util)
  (:require-macros [aurora.macros :refer [check defchecked]]))

(defn head [x]
  (try (name (first x)) (catch :default _ nil)))

(defn indent [lines]
  (join "\n" (for [line (split-lines lines)] (str "  " line))))

(defchecked js-data->string [x]
   (cond
    (nil? x) "null"
    (number? x) (str x)
    (string? x) (pr-str x)
    (vector? x) (str "[" (join ", " (map js-data->string x)) "]")
    (map? x) (check (empty? x) ;; TODO emit objects
                    (str "{" "}"))
    :else (check false)))

(defchecked cljs-data->string [x]
   (cond
    (nil? x) "null"
    (number? x) (str x)
    (string? x) (pr-str x)
    (vector? x) (expression->string `(cljs.core.PersistentVector.fromArray ~data))
    (map? x) (expression->string `(cljs.core.PersistentHashMap.fromArrays ~(vec (keys data)) ~(vec (vals data))))
    :else (check false)))

(defchecked name->string [x]
  (check (symbol? x))
  (name x))

(defchecked var->string [x]
   (cond
    (symbol? x) (name->string x)
    (= "get!" (head x)) (do (check (= (count x) 3))
                          (str (expression->string (nth x 1)) "[" (expression->string (nth x 2)) "]"))
    (= ".." (head x)) (do (check (= (count x) 3))
                        (str (expression->string (nth x 1)) "." (name->string (nth x 2))))
    :else (check false)))

(defchecked expression->string [x]
  (cond
   (or (symbol? x) (#{"get!" ".."} (head x))) (var->string x)
   (or (nil? x) (number? x) (string? x) (vector? x) (map? x)) (js-data->string x)
   (= "edn" (head x)) (do (check (= (count x) 2))
                        (cljs-data->string (nth x 1)))
   (= "=" (head x)) (do (check (= (count x) 3))
                      (str (expression->string (nth x 1)) " == " (expression->string (nth x 2))))
   (= "==" (head x)) (do (check (= (count x) 3))
                       (str (expression->string (nth x 1)) " === " (expression->string (nth x 2))))
   (= "not" (head x)) (do (check (= (count x) 2))
                        (str "!(" (expression->string (nth x 1)) ")"))
   (= "fn" (head x)) (do (check (= (count x) 5)
                                (vector? (nth x 2)))
                       (str "function " (when (nth x 1) (name->string (nth x 1))) "(" (join ", " (map name->string (nth x 2))) ") {\n"
                            (indent (statement->string (nth x 3))) "\n"
                            (indent (str "return " (expression->string (nth x 4)) ";")) "\n"
                            "}"))
   (seq? x) (do (check (>= (count x) 1))
              (str (expression->string (nth x 0)) "(" (join ", " (map expression->string (rest x))) ")"))
   :else (check false)))

(defchecked statement->string [x]
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
   :else (expression->string x)))
