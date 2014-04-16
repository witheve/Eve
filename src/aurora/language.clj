(ns aurora.language)

(defmacro deffact [name madlib&keys]
  `(do
     (def ~name
       (fact-shape (keyword (str '~(get-in &env [:ns :name])) (str '~name)) ~madlib&keys))
     (defn ~(symbol (str "->" name)) [& args#]
       (fact ~name (.-arr args#)))))
