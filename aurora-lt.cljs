(ns lt.plugins.aurora
  (:require [lt.object :as object]
            [lt.objs.eval :as eval]
            [lt.objs.editor :as ed]
            [lt.objs.files :as files]
            [cljs.reader :as reader]
            [lt.objs.clients :as clients]
            [lt.util.dom :refer [$ append]]))

(defn ->exec [s path clear?]
  (str "aurora.engine.exec_program(cljs.reader.read_string(" (pr-str s) "), " (pr-str clear?) ");

       //# sourceURL=" path))

(object/behavior* ::on-eval-clear
                  :triggers #{:eval}
                  :reaction (fn [editor]
                              (let [neue-path (-> @editor :info :path)]
                              (object/merge! aurora-lang {:last neue-path})
                              (object/raise aurora-lang :eval! {:origin editor
                                                                :info (assoc (@editor :info)
                                                                        :code (->exec (ed/->val (:ed @editor)) (or (-> @editor :info :path) (-> @editor :info :name)) true))}))))

(object/behavior* ::on-eval
                  :triggers #{:eval.one}
                  :reaction (fn [editor]
                              (let [neue-path (-> @editor :info :path)
                                    clear? (not= neue-path (@aurora-lang :last))]
                              (object/merge! aurora-lang {:last neue-path})
                              (object/raise aurora-lang :eval! {:origin editor
                                                                :info (assoc (@editor :info)
                                                                        :code (->exec (ed/->val (:ed @editor)) (or (-> @editor :info :path) (-> @editor :info :name)) clear?))}))))

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
(object/tag-behaviors :editor.aurora #{::on-eval ::eval-on-save ::on-eval-clear})
