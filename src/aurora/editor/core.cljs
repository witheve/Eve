(ns aurora.editor.core
  (:require [aurora.compiler.ast :as ast]
            [aurora.compiler.compiler :as compiler]
            [cljs.reader :as reader]))

(enable-console-print!)

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

(def cache (atom {}))
(def representations-cache (atom {}))

;;*********************************************************
;; Aurora state (mutation!)
;;*********************************************************

(defn from-cache [path]
  (if (coll? path)
    (get-in @aurora-state (concat [:cache] path))
    (get-in @aurora-state [:cache path])))

(defn input? [id]
  (get-in @aurora-state [:cache :inputs id]))

(defn change-input! [func]
  (when-let [[path] (first (get-in @aurora-state [:cache :inputs]))]
    (let [cur (js/aurora.editor.cursors.from-path path)]
      (when (js/aurora.editor.cursors.map-key-cursor? cur)
        (assoc-cache! [:inputs] {(concat (butlast path) [{:aurora.editor.ui/key (func)}]) true}))
      (js/aurora.editor.cursors.swap! cur func))))

(defn clear-input []
  (swap! aurora-state assoc-in [:cache :inputs] nil))

(defn assoc-cache! [path v]
  (swap! aurora-state assoc-in (concat [:cache] path) v))

(defn add-input! [id path]
  (swap! aurora-state assoc-in [:cache :inputs] {id path}))

(defn remove-input! [id]
  (swap! aurora-state update-in [:cache :inputs] dissoc id))

(defn add-index! [thing]
  (swap! aurora-state assoc-in [:index (:id thing)] thing))

(defn add-notebook! [desc]
  (let [notebook {:type :notebook
                  :id (compiler/new-id)
                  :desc desc
                  :pages []}]
    (when (ast/notebook! (:index @aurora-state) notebook)
      (add-index! notebook)
      (js/aurora.editor.cursors.swap! aurora-state update-in [:notebooks] conj (:id notebook))
      (add-input! (:id notebook) :desc)
      notebook)))

(defn remove-notebook! [notebook]
  (swap! aurora-state update-in [:notebooks] #(vec (remove #{(:id notebook)} %))))

(defn add-page! [notebook desc & [opts]]
  (let [page (merge {:type :page
                     :id (compiler/new-id)
                     :tags (if-not (:anonymous opts)
                             #{:page}
                             #{})
                     :args []
                     :desc desc
                     :steps []}
                    opts)]
    (when (ast/page! (:index @aurora-state) page)
      (add-index! page)
      (js/aurora.editor.cursors.swap! notebook update-in [:pages] conj (:id page))
      page)))

(defn remove-page! [notebook page]
  (swap! page assoc :pages (vec (remove #{(:id @page)} (:pages @notebook)))))

(defn add-step! [page info]
  (try
    (let [step (merge {:id (compiler/new-id)} info)]
      (when (ast/step! (:index @aurora-state) step)
        (add-index! step)
        (js/aurora.editor.cursors.swap! page update-in [:steps] conj (:id step))
        step))
    (catch :default e
      (.error js/console (pr-str e)))))

(defn remove-step! [page step]
  (js/aurora.editor.cursors.swap! page assoc :steps (vec (remove #{(:id @step)} (:steps @page)))))

;;*********************************************************
;; Aurora state (storage!)
;;*********************************************************

(def last-freeze nil)

(defn freeze [state]
  (-> state
      (dissoc :cache)
      (pr-str)))

(defn store! [state]
  (when-not (identical? last-freeze (:index state))
    (set! last-freeze (:index state))
    (aset js/localStorage "aurora-state" (freeze state))))

(defn thaw [state]
  (let [state (if (string? state)
                (reader/read-string state)
                state)]
    (-> state
        (assoc-in [:cache :representations] @representations-cache)
        (update-in [:index] merge ast/core))))

(defn repopulate []
  (let [stored (aget js/localStorage "aurora-state")]
    (if (and stored
             (not= "{}" stored)
             (not= "null" stored)
             (not= stored ""))
      (reset! aurora-state (thaw stored))
      (reset! aurora-state (thaw default-state)))))

(defn clear-storage! []
  (aset js/localStorage "aurora-state" nil))

(add-watch aurora-state :storage (fn [_ _ _ cur]
                                   (store! cur)))



(comment
  (reset! aurora-state (reader/read-string "{:page \"49e1e80f_a073_48d6_ba4a_f2da39faecea\", :index {\"bd1a0a03_a3bb_48c1_be6d_5c18aaec8ba2\" {:expression [{:type :ref/js, :js \"+\"} {:type :ref/id, :id \"16b04bba_9bcc_4540_a0e5_0465d16fb6fd\"} {:type :ref/id, :id \"7162c4df_15cb_4cba_a8fd_cd95b26adc29\"}], :type :math, :id \"bd1a0a03_a3bb_48c1_be6d_5c18aaec8ba2\"}, \"20185f62_f4c3_4480_980f_c7d0d2e26f34\" {:type :constant, :id \"20185f62_f4c3_4480_980f_c7d0d2e26f34\", :data [1 2 3]}, \"44f97faf_de63_423a_b68f_0bb54332c573\" {:ref {:type :ref/js, :js \"cljs.core.mapv\"}, :type :call, :id \"44f97faf_de63_423a_b68f_0bb54332c573\", :args [{:type :ref/id, :id \"103a16af_f99a_4f44_a7ab_f6e53971cbc9\"} [1 2 9]]}, \"16b04bba_9bcc_4540_a0e5_0465d16fb6fd\" {:expression [{:type :ref/js, :js \"-\"} 6 {:type :ref/id, :id \"current\"}], :type :math, :id \"16b04bba_9bcc_4540_a0e5_0465d16fb6fd\"}, \"7405a129_2ff1_4bc8_b3f9_6e74efb0f606\" {:branches [{:guards [], :pattern [6 2 3], :action {:type :constant, :data \"wheeee\"}, :type :match/branch}], :arg {:type :ref/id, :id \"44f97faf_de63_423a_b68f_0bb54332c573\"}, :type :match, :id \"7405a129_2ff1_4bc8_b3f9_6e74efb0f606\"}, \"332c3ac6_9969_4014_9271_129753c4bcef\" {:desc \"untitled page\", :tags #{:page}, :type :page, :id \"332c3ac6_9969_4014_9271_129753c4bcef\", :args [\"root\"], :steps []}, \"103a16af_f99a_4f44_a7ab_f6e53971cbc9\" {:desc \"do\", :tags #{}, :type :page, :id \"103a16af_f99a_4f44_a7ab_f6e53971cbc9\", :args [\"current\"], :steps [\"bc9915cc_2e0f_4628_9416_4217bb4ccb02\" \"16b04bba_9bcc_4540_a0e5_0465d16fb6fd\" \"7162c4df_15cb_4cba_a8fd_cd95b26adc29\" \"bd1a0a03_a3bb_48c1_be6d_5c18aaec8ba2\" \"a3376ab1_4689_45a6_bced_5848d0622568\"], :anonymous true}, \"a3376ab1_4689_45a6_bced_5848d0622568\" {:expression [{:type :ref/js, :js \"+\"} 3 {:type :ref/id, :id \"bd1a0a03_a3bb_48c1_be6d_5c18aaec8ba2\"}], :type :math, :id \"a3376ab1_4689_45a6_bced_5848d0622568\"}, \"bc9915cc_2e0f_4628_9416_4217bb4ccb02\" {:type :constant, :id \"bc9915cc_2e0f_4628_9416_4217bb4ccb02\", :data {:type :ref/id, :id \"current\"}}, \"76838021_4b8d_4778_802b_9af9b3b2e1fd\" {:desc \"untitled notebook\", :type :notebook, :id \"76838021_4b8d_4778_802b_9af9b3b2e1fd\", :pages [\"49e1e80f_a073_48d6_ba4a_f2da39faecea\" \"103a16af_f99a_4f44_a7ab_f6e53971cbc9\" \"332c3ac6_9969_4014_9271_129753c4bcef\"]}, \"7162c4df_15cb_4cba_a8fd_cd95b26adc29\" {:expression [{:type :ref/js, :js \"+\"} {:type :ref/id, :id \"16b04bba_9bcc_4540_a0e5_0465d16fb6fd\"} 8], :type :math, :id \"7162c4df_15cb_4cba_a8fd_cd95b26adc29\"}, \"49e1e80f_a073_48d6_ba4a_f2da39faecea\" {:desc \"untitled page\", :tags #{:page}, :type :page, :id \"49e1e80f_a073_48d6_ba4a_f2da39faecea\", :args [\"root\"], :steps [\"20185f62_f4c3_4480_980f_c7d0d2e26f34\" \"44f97faf_de63_423a_b68f_0bb54332c573\" \"7405a129_2ff1_4bc8_b3f9_6e74efb0f606\"]}}, :editor-zoom :stack, :notebooks [\"76838021_4b8d_4778_802b_9af9b3b2e1fd\"], :document true, :notebook \"76838021_4b8d_4778_802b_9af9b3b2e1fd\", :steps true, :stack ([:step \"bd1a0a03_a3bb_48c1_be6d_5c18aaec8ba2\"] [:page \"103a16af_f99a_4f44_a7ab_f6e53971cbc9\"] [:step \"44f97faf_de63_423a_b68f_0bb54332c573\"] [:page \"49e1e80f_a073_48d6_ba4a_f2da39faecea\"] [:notebook \"76838021_4b8d_4778_802b_9af9b3b2e1fd\"]), :open-paths {([:step \"44f97faf_de63_423a_b68f_0bb54332c573\"] [:page \"49e1e80f_a073_48d6_ba4a_f2da39faecea\"] [:notebook \"76838021_4b8d_4778_802b_9af9b3b2e1fd\"]) nil}, :step [], :screen :editor}"
                                           )))
