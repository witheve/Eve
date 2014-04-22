(ns aurora.runtime.stdlib
  (:require [aurora.language :as language]))



(def clauses {"draw" {:madlib ["ui"]
                      :madlib-str "ui"
                      :is-phrase true
                      :placeholders {"ui" {:order 0 :type "ui" "type" "ui"}}}
              })

(def madlibs {:aurora/tick {}
              :aurora/time {:madlib ["the current time is ", "time"]
                            :madlib-str "the current time is [time]"
                            :placeholders {"time" {:order 0
                                                   :type "time"}}}
              :aurora/refresh {:madlib ["refresh the time after ", "waiting time"]
                               :madlib-str "refresh the time after [waiting time]"
                               :remembered true
                               :placeholders {"waiting time" {:order 0
                                                              :type "duration"}}}
              :timers/tick {:madlib ["timer", " ticked at ", "time"]
                            :madlib-str "[timer] ticked at [time]"
                            :placeholders {"timer" {:order 0
                                                    :type "id"}
                                           "time" {:order 1
                                                   :type "time"}}}
              :timers/wait {:madlib ["tick ", "timer", " after waiting ", "time"]
                            :madlib-str "tick [timer] after waiting [time]"
                            :placeholders {"timer" {:order 0
                                                    :type "id"}
                                           "time" {:order 1
                                                   :type "duration"}}}
              :ui/elem {:madlib ["id", " is a ", "tag", " HTML element"]
                        :madlib-str "[id] is a [tag] HTML element"
                        :placeholders {"id" {:order 0
                                             :type "id"}
                                       "tag" {:order 1
                                              :type "html tag"}}}
              :ui/attr {:madlib ["id", " has a ", "attr", " of ", "value"]
                        :madlib-str "[id] has a [attr] of [value]"
                        :placeholders {"id" {:order 0
                                             :type "id"}
                                       "attr" {:order 1
                                               :type "html attribute"}
                                       "value" {:order 2}}}
              :ui/style {:madlib ["id", " has a ", "attr", " style of ", "value"]
                         :madlib-str "[id] has a [attr] style of [value]"
                         :placeholders {"id" {:order 0
                                              :type "id"}
                                        "attr" {:order 1
                                                :type "html style"}
                                        "value" {:order 2}}}
              :ui/text {:madlib ["id", " is the text ", "text"]
                        :madlib-str "[id] is the text [text]"
                        :placeholders {"id" {:order 0
                                             :type "id"}
                                       "text" {:order 1
                                               :type "string"}}}
              :ui/child {:madlib ["id", " is the parent of ", "child", " at position ", "pos"]
                         :madlib-str "[id] is the parent of [child] at position [pos]"
                         :placeholders {"id" {:order 0
                                              :type "id"}
                                        "child" {:order 1
                                                 :type "id"}
                                        "pos" {:order 2
                                               :type "number"}}}
              :ui/event-listener {:madlib ["listen for ", "event", " events on ", "id"]
                                  :madlib-str "listen for [event] events on [id]"
                                  :placeholders {"event" {:order 0
                                                          :type "html event"}
                                                 "id" {:order 1
                                                       :type "id"}}}
              :ui/onClick {:madlib ["id", " is clicked, causing " "event" " on " "entity"]
                           :madlib-str "[id] is clicked, causing [event] on [entity]"
                           :placeholders {"id" {:order 0
                                                :type "id"}
                                          "event" {:order 1
                                                   :type "string"}
                                          "entity" {:order 2
                                                    :type "string"}}}
              :ui/onDoubleClick {:madlib ["id", " is double clicked raising ", "event", " on ", "entity"]
                                 :madlib-str "[id] is double clicked raising [event] on [entity]"
                                 :placeholders {"id" {:order 0
                                                      :type "id"}
                                                "event" {:order 1
                                                         :type "string"}
                                                "entity" {:order 2
                                                          :type "id"}}}
              :ui/onKeyDown {:madlib ["the ", "keyCode", " key is pressed in " "id" " on " "entity"]
                             :madlib-str "the [keyCode] key is pressed in [id]"
                             :placeholders {"id" {:order 0
                                                  :type "id"}
                                            "keyCode" {:order 1
                                                       :type "key"}
                                            "entity" {:order 2
                                                      :type "string"}}}

              :ui/onBlur {:madlib ["id", " is blurred with ", "entity"]
                          :madlib-str "[id] is blurred"
                          :placeholders {"id" {:order 0
                                               :type "id"}
                                         "entity" {:order 1
                                                   :type "string"}}}
              :ui/onChange {:madlib ["id", " changed to ", "value", " raising ", "event", " on ", "entity"]
                            :madlib-str "[id] changed to [value] raising [event] on [entity]"
                            :placeholders {"id" {:order 0
                                                 :type "id"}
                                           "value" {:order 1
                                                    :type "string"}
                                           "event" {:order 2
                                                    :type "string"}
                                           "entity" {:order 3
                                                     :type "id"}}}
              :http/get {:madlib ["fetch " "url" " and call it ", "id"]
                         :madlib-str "fetch [url] and call it [id]"
                         :placeholders {"url" {:order 0
                                               :type "url"}
                                        "id" {:order 1
                                              :type "string"}}}
              :http/response {:madlib ["got url " "content" " named " "id" " at " "time"]
                              :madlib-str "got url [content] named [id] at [time]"
                              :placeholders {"content" {:order 0
                                                        :type "string"}
                                             "id" {:order 1
                                                   :type "string"}
                                             "time" {:order 2
                                                     :type "time"}}}
              :aurora/let {:madlib ["x" " = " "y"]
                           :madlib-str "[x] = [y]"
                           :placeholders {"x" {:order 0}
                                          "y" {:order 1}}}
              })

(defn map->fact [m]
  (let [info (get madlibs (:ml m))
        ks (filterv identity (map m (:madlib info)))]
    (language/fact (:ml m) (to-array ks))))

(defn cur-date [x]
  (js/Date. x))

(set! js/cljs.core.date cur-date)

(set! js/cljs.core.iff (fn [expression then else]
                        (if expression then else)))
