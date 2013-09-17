(ns aurora.util.async
   (:require
    [cljs.core.async :as async
     :refer [<! >! chan close! sliding-buffer dropping-buffer
             put! timeout]]
    [cljs.core.async.impl.protocols :as proto]
    [goog.net.Jsonp]
    [goog.Uri])
  (:require-macros
    [cljs.core.async.macros :as m :refer [go alt!]]))

(defn debounce
  ([source msecs]
    (debounce (chan) source msecs))
  ([c source msecs]
    (go
      (loop [state ::init cs [source]]
        (let [[_ threshold] cs]
          (let [[v sc] (alts! cs)]
            (condp = sc
              source (condp = state
                       ::init
                         (do (>! c v)
                           (recur ::debouncing
                             (conj cs (timeout msecs))))
                       ::debouncing
                         (recur state
                           (conj (pop cs) (timeout msecs))))
              threshold (recur ::init (pop cs)))))))
    c))
