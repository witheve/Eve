(ns aurora.jsth
  (:require [clojure.string :refer [join split-lines]]
            aurora.util)
  (:require-macros [aurora.macros :refer [check]]))

(defn head [x]
  (try (name (first x)) (catch :default _ nil)))

(defn indent [lines]
  (join "\n" (for [line (split-lines lines)] (str "  " line))))

(defn js-data->string [x]
  (check
   (cond
    (nil? x) "null"
    (number? x) (str x)
    (string? x) (pr-str x)
    (vector? x) (str "[" (join ", " (map js-data->string x)) "]")
    (map? x) (do (check (empty? x)) ;; TODO emit objects
               (str "{" "}")))))

(defn cljs-data->string [x]
  (check
   (cond
    (nil? x) "null"
    (number? x) (str x)
    (string? x) (pr-str x)
    (vector? x) (expression->string `(cljs.core.PersistentVector.fromArray ~data))
    (map? x) (expression->string `(cljs.core.PersistentHashMap.fromArrays ~(vec (keys data)) ~(vec (vals data)))))))

(defn name->string [x]
  (check (symbol? x))
  (str x))

(defn var->string [x]
  (check
   (cond
    (symbol? x) (name->string x)
    (= "get!" (head x)) (do (check (= (count x) 3))
                          (str (expression->string (nth x 1)) "[" (expression->string (nth x 2)) "]"))
    (= ".." (head x)) (do (check (= (count x) 3))
                        (str (expression->string (nth x 1)) "." (name->string (nth x 2)))))))

(defn expression->string [x]
  (check
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
    (= "fn" (head x)) (do (check (= (count x) 5))
                        (check (sequential? (nth x 2)))
                        (str "function " (when (nth x 1) (name->string (nth x 1))) "(" (join ", " (map name->string (nth x 2))) ") {\n"
                             (indent (statement->string (nth x 3))) "\n"
                             (indent (str "return " (expression->string (nth x 4)) ";")) "\n"
                             "}"))
    (seq? x) (do (check (>= (count x) 1))
               (str (expression->string (nth x 1)) "(" (join ", " (map expression->string (rest x))) ")")))))

(defn statement->string [x]
  (check
   (cond
    (= "do" (head x)) (join "\n" (map statement->string (rest x)))
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
                                  (check (= (count catch) 3))
                                  (str " catch (" (name->string (nth catch 1)) ") {\n"
                                       (indent (statement->string (nth catch 2))) "\n"
                                       "}")))))
    :else (expression->string x))))
