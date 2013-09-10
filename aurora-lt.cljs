(ns lt.plugins.aurora
  (:require [lt.object :as object]
            [lt.objs.eval :as eval]
            [lt.objs.editor :as ed]
            [lt.objs.files :as files]
            [cljs.reader :as reader]
            [lt.objs.clients :as clients]
            [lt.util.dom :refer [$ append]]))

(defn ->exec [s path]
  (str "aurora.engine.exec_program(cljs.reader.read_string(" (pr-str s) "));

       //# sourceURL=" path))

(object/behavior* ::on-eval
                  :triggers #{:eval
                              :eval.one}
                  :reaction (fn [editor]
                              (object/raise aurora-lang :eval! {:origin editor
                                                             :info (assoc (@editor :info)
                                                                     :code (->exec (ed/->val (:ed @editor)) (or (-> @editor :info :path) (-> @editor :info :name))))})))

(object/behavior* ::eval-on-save
                  :triggers #{:save}
                  :reaction (fn [editor]
                              (when (and (-> @editor :client :default)
                                         (not (clients/placeholder? (-> @editor :client :default))))
                                (object/raise editor :eval))))

(object/behavior* ::eval!
                  :triggers #{:eval!}
                  :reaction (fn [this event]
                              (let [{:keys [info origin]} event]
                                (clients/send (eval/get-client! {:command :editor.eval.js
                                                                 :origin origin
                                                                 :info info})
                                              :editor.eval.js
                                              info
                                              :only origin))))

(object/object* ::aurora-lang
                :tags #{:aurora-lang})

(def aurora-lang (object/create ::aurora-lang))

(object/tag-behaviors :aurora-lang #{::eval!})
(object/tag-behaviors :editor.aurora #{::on-eval ::eval-on-save})
