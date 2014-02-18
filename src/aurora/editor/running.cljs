(ns aurora.editor.running
  (:require [aurora.editor.core :refer [aurora-state from-cache assoc-cache!]]
            [aurora.editor.stack :refer [push stack->cursor rev-stack->cursor]]
            [aurora.util.core :refer [now]]))

;;*********************************************************
;; running (this shouldn't be part of the UI eventually)
;;*********************************************************

(def run-stack (atom nil))
(def cur-state (atom 1))
(def cur-notebook nil)
(def last-page nil)
(def prev nil)

(defn find-error-frames [stack]
  (loop [frame stack
         error-frames []
         page-stack [[:page (aget stack "id")]]]
    (let [page-stack (conj page-stack [:step (first (aget frame "exception"))])
          error-frames (if (.-exception frame)
                         (conj error-frames {:stack page-stack
                                             :frame frame})
                         error-frames)]
      (if-let [next-frame (last (aget frame "calls"))]
        (recur next-frame error-frames (conj page-stack [:page (aget next-frame "id")]))
        error-frames))))

(defn error-frames->errors [frames notebook-id e]
  (into {}
        (for [{:keys [stack frame]} frames]
            [(reverse (concat [[:notebook notebook-id]] stack))
             e])))

(def compile-worker (js/Worker. "compiler.js"))
(.addEventListener compile-worker "message" (fn [e]
                                              (handle-compile (.-data e))))

(defn send-off-compile [index notebook-id]
  (.postMessage compile-worker (pr-str {:index index
                                        :notebook notebook-id})))

(defn source->notebook [source]
  (set! cur-notebook (js/eval (str "(" source "());"))))

(defn handle-compile [data]
  (set! (.-innerHTML (js/document.getElementById "compile-perf")) (.-time data))
  (source->notebook (.-source data))
  (re-run))

(defn run-source [notebook page state]
  (let [start (now)
        stack #js []
        func (when cur-notebook (aget cur-notebook (str "value_" (:id @page))))]
    (when (and func cur-notebook)
      (aset cur-notebook "next_state" state)
      (aset cur-notebook "stack" stack)
      (try
        (let [v [(func state []) (.-next_state cur-notebook) (aget stack 0)]]
          (assoc-cache! [:errors] nil)
          (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
          v)
        (catch :default e
          (let [v [e (.-next_state cur-notebook) (aget stack 0)]
                frames (find-error-frames (aget stack 0))
                errors (error-frames->errors frames (:id @notebook) e)]
            (println "ERROR STACK: " errors)
            (assoc-cache! [:errors] errors)
            (set! (.-innerHTML (js/document.getElementById "run-perf")) (- (now) start))
            v))))))

(defn re-run []
  (let [stack (:stack @aurora-state)
        run (run-source (rev-stack->cursor stack :notebook) (rev-stack->cursor stack :page) @cur-state)]
    (reset! cur-state (second run))
    (reset! run-stack #js {:calls #js [(nth run 2)]})
    (js/aurora.editor.ui-graph.queue-render)))

(defn find-id [thing id]
  (.filter (aget thing "calls") #(= (aget % "id") id)))

(defn traverse-path [stack path iters]
  (loop [stack stack
         path path
         cur-path '()]
    (when stack
      (let [[type id :as segment] (first path)]
        (cond
         (not path) stack
         (not= type :page) (recur stack (next path) (conj cur-path segment))
         :else (let [cur-path (conj cur-path segment)
                     cur-iter (or (get iters cur-path) 0)]
                 (recur (aget (find-id stack id) cur-iter) (next path) cur-path)))))))

(defn path->frame [path]
  (traverse-path @run-stack (reverse path)
                 (from-cache [:path-iterations])))

(defn path->iter-count [path]
  (when-let [frame (traverse-path @run-stack (reverse (drop 2 path))
                                  (from-cache [:path-iterations]))]
    (when-let [calls (aget frame "calls")]
      (.-length (find-id frame (-> (stack->cursor path :page)
                                   (deref)
                                   (:id)))))))

(defn path->match-branch [path]
  (when-let [frame (path->frame path)]
    (-> frame
        (aget "matches")
        (aget (str "value_" (-> path
                                (first)
                                (second))))
        )))

(defn path->result [path]
  (when-let [frame (path->frame path)]
    (when (.-vars frame)
      (-> frame
          (aget "vars")
          (aget (str "value_" (-> path
                                  (first)
                                  (second))))
          ))))

(add-watch aurora-state :running (fn [_ _ _ cur]
                                   (println last-page (:page cur))
                                   (when (and (:notebook cur) (:page cur))
                                     (cond
                                      (not (identical? prev (:index cur))) (send-off-compile (:index cur) (:notebook cur))
                                      (not= last-page (:page cur)) (do
                                                                     (set! last-page (:page cur))
                                                                     (re-run))
                                      :else  (comment
                                               (set! (.-innerHTML (js/document.getElementById "compile-perf")) "n/a")
                                               (set! (.-innerHTML (js/document.getElementById "run-perf")) "n/a"))))
                                   (set! prev (:index cur))
                                   (set! last-page (:page cur))))
