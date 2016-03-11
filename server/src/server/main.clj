(ns server.main
  (:gen-class)
  (:require
   [server.db :as db]
   [server.edb :as edb]
   [server.log :as log]
   [server.repl :as repl]
   [server.jsclient :as jsclient]))



(defn -main [& args]
  ;; load existing database
  (let [d (edb/create-edb)
        interactive (atom true)
        server (atom ":8081")

        ;; load the local metadata before starting membership
        flag-map
        {"-d" (fn [] (swap! interactive (fn [x] false)))}
        
        parameter-map
        {"-s" log/set-pathname
         "-p" (fn [x] (swap! server (fn [x] (Integer. x))))
         "-e" (fn [x] (repl/eeval d (read-string x)))}

        
        arglist (fn arglist [args]
                  (if (empty? args) ()
                      (if-let [f (flag-map (first args))]
                        (do (f)
                            (arglist (rest args)))
                        (if-let [p (parameter-map (first args))]
                          ;; check to make sure we have such a thing?
                          (do (p (second args))
                              (arglist (rest (rest args))))
                          (println "wth man" (first args))))))]
    (arglist args)
    (when @server (jsclient/serve d @server))
    (when @interactive (repl/rloop d))))
