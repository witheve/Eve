(ns aurora.editor.core
  (:require [aurora.compiler.ast :as ast]))

;;*********************************************************
;; Aurora state
;;*********************************************************

(def aurora-state (atom nil))
(def default-state {:notebook nil
                    :page nil
                    :step []
                    :screen :notebooks
                    :steps true
                    :document true
                    :open-paths {}
                    :cache {}
                    :index ast/core
                    :notebooks []})
