(ns server.spec-util
  (:require [speclj.core :refer :all]))

(defmacro should-include [expected-form actual-form]
  `(let [expected# ~expected-form
         actual# ~actual-form
         expected-keys# (keys expected#)
         missing-keys# (filter (complement (fn foop [key#] (contains? actual# key#))) expected-keys#)
         included# (select-keys actual# expected-keys#)]
     (when-not (= expected# included#)
     (-fail (str "     Expected: " (-to-s expected#) speclj.platform/endl
                 "     got: " (-to-s actual#)
                 (when (> (count missing-keys#) 0)
                   (str speclj.platform/endl "     missing: "  (vec missing-keys#)))
                  " (using include)")))))
