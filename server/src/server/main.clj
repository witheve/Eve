(ns server.main
  (:gen-class)
  (:require
   [server.db :as db]
   [server.edb :as edb]
   [server.log :as log]
   [server.smil :as smil]
   [server.repl :as repl]
   [clojure.java.io :as io]
   [server.jsclient :as jsclient]))

(defonce edb (atom nil))
(defonce trace (atom false))
(defonce service (atom true))
(defonce user (atom (db/wrapoid 100 0 0)))
(defonce bag (atom (db/wrapoid 101 0 0)))

(defn -main [& args]
  ;; load existing database..change the way the user is bound here, should go through
  ;; a shim. should also not be exposed to weasl
  (when (nil? @edb) (reset! edb (edb/create-edb)))
  (let [interactive (atom true)
        port (atom 8081)

        ;; load the local metadata before starting membership
        flag-map
        {
         "-d" (fn [] (reset! interactive false))
         "-n" (fn [] (reset! service false))
         "-t" (fn [] (reset! trace true))
         }

        ;; take user and bag for interactive
        parameter-map
        {"-s" (fn [x]
                (io/make-parents x)
                (let [f (clojure.java.io/file x)
                      existing (log/bags x)]
                  (.mkdir f)
                  ;; maka bag
                  (doseq [i existing]
                    (println "ibag" i)
                    (log/scan x i))
                  ;; read existing logs, we really want to log all the bags, but hey
                  (log/open @edb x @bag)))

         "-p" (fn [x] (reset! port (Integer. x)))

         "-f" (fn [x]
                (reset! interactive false)
                (reset! service false)
                (try (repl/read-all (edb/create-view @edb @bag @user) (list 'load x) @trace)
                     (catch Exception e
                       (println "error" e))))

         "-e" (fn [x] (try (repl/eeval (edb/create-view @edb @bag @user) (smil/read x) @trace)
                           (catch Exception e
                             (println "error" e))))
         }


        arglist (fn arglist [args]
                  (if (empty? args) ()
                      (if-let [f (flag-map (first args))]
                        (do (f)
                            (arglist (rest args)))
                        (if-let [p (parameter-map (first args))]
                          ;; check to make sure we have such a thing?
                          (do (p (second args))
                              (arglist (rest (rest args))))
                          (println "invalid argument" (first args))))))]
    (arglist args)
    ;; move down
    (when @service (jsclient/serve (edb/create-view @edb @bag @user) @port))
    (when @interactive (repl/rloop (edb/create-view @edb @bag @user)))))
