(ns aurora.other-language
  (:require [cemerick.double-check :as dc]
            [cemerick.double-check.generators :as gen]
            [cemerick.double-check.properties :as prop :include-macros true])
  (:require-macros [aurora.macros :refer [apush apush* lt lte gt gte set!! dofrom]]))
