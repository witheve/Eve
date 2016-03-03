(ns server.edb)


(defn create-edb []
  (let [tuples (atom '())
        listeners (atom '())]

    (fn [index c]
      (and (not (nil? c)) (doseq [i @tuples]
                            (c 'insert i)))
      (fn [op tuple]
        (println "db" op tuple)
        ;; demux op
        (swap! tuples conj tuple)
        (doseq [i @listeners] (i op tuple))))))
