(ns aurora.util.xhr
  (:require [goog.net.XhrIo :as xhr]
            [clojure.string :as string]
            [cljs.reader :as reader]
            [goog.events :as events]
            [goog.Uri.QueryData :as query-data]
            [goog.structs :as structs]
            [cljs.core.async.impl.protocols :as protos]
            [cljs.core.async :refer [put! chan sliding-buffer take! timeout]]))

(defn ->method [m]
  (string/upper-case (name m)))

(defn parse-route [route]
  (cond
    (string? route) ["GET" route]
    (vector? route) (let [[m u] route]
                      [(->method m) u])
    :else ["GET" route]))

(defn ->data [d]
  (let [cur (clj->js d)
        query (query-data/createFromMap (structs/Map. cur))]
    (str query)))

(defn xhr [route content & [opts]]
  (let [req (new goog.net.XhrIo)
        [method uri] (parse-route route)
        data (->data content)
        result (chan)]
    (events/listen req goog.net.EventType/COMPLETE #(put! result (.getResponseText req)))
    (. req (send uri method data (when opts (clj->js opts))))
    result))
