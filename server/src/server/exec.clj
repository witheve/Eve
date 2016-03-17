(ns server.exec
  (:require [server.edb :as edb]
            [server.avl :as avl]))

(defn ignore-flush [r db c terms]
  (c r))

(defn print-program [p]
  (letfn [(mlist? [x] (or (list? x) (= (type x) clojure.lang.Cons)))
          (traverse [x indent]
            (cond
              (instance? clojure.lang.LazySeq x) (traverse (apply list (doall x)) indent)
              
              ;; reduce on () does someting unspeakable
              (and (mlist? x) (empty? x)) "()"
              
              (and (mlist? x) (mlist? (first x)))
              (reduce (fn [y x] (str y "\n" x)) ""
                      (map (fn [z]  (str (apply str (repeat indent " "))
                                         (traverse z (+ indent 4)))) x))
              
              (mlist? x)
              (str "(" (reduce (fn [y x] (str y " " x))
                               (map (fn [z] (traverse z indent)) x)) ")")
              
              (or (number? x) (string? x) (symbol? x) (vector? x)) (str x)
              :else (str "<unknown>")))]
    (traverse p 0)))

(defn rset [r ref v]
  (let [c (count ref)]
    (cond 
      (= c 0) ()
      (= c 1) (if (> (ref 0) (count r))
                (do (println "exec error" (ref 0) "is greater than" (count r))
                    (throw c))
                (assoc r (ref 0) v))
      :else 
      (assoc r (ref 0) 
             (rset (r (ref 0)) (subvec ref 1) v)))))

(defn rget [r ref]
  (cond (not (vector? ref)) ref
        ;; special case of constant vector, empty
        (= (count ref) 0) ref
        ;; some persistent lists slip in here
        (= (count ref) 1) (nth r (ref 0))
        :else 
        (rget (r (ref 0)) (subvec ref 1))))


;; support singletons?
(defn exec-tuple [r db c terms]
  (c (rset r (second terms)
                (vec (map (fn [x] (rget r x)) (rest (rest terms)))))))


(defn exec-sort [r db c terms]
  (let [state (avl/sorted-map)]
    (condp = (r 0)
      'insert (conj state terms)
      'remove (disj state terms))))

;; sum cdest pararms body?
(defn exec-sum [r db c terms]
  (let [total (atom 0)]
    (fn [t]
      (condp = (r 0)
        'insert (swap! total (fn [x] (+ x (nth terms 2))))
        'remove (swap! total (fn [x] (- x (nth terms 2))))
        'flush (swap! total (fn [x] (- x (nth terms 2))))))))


;; a delta function specifically to translate assertions and removals
;; into the operator stream used by the runtime. make transactional
(defn exec-delta-e [register d c terms]
  (let [[delto dest out] terms
        assertions (atom {})
        record (fn [m k] (if-let [r (m key)] r
                                 ((fn [r] (swap! m assoc k r) r)
                                  (atom #{}))))
        removals (atom {})
        backwards (atom {})
        base (fn base [t]
               (cond
                 (not t) t
                 (contains? assertions t) t
                 :else
                 (base (@backwards t))))

        walk (fn walk [t] (let [k (@removals t)]
                            (if (= k nil) true
                                (not (some walk k)))))]                           
        
    (fn [tuple]
      ;; doesn't need a source identifier
      (let [[op e a v b t] tuple]
        (if (= op 'insert)
          (if (= a edb/remove-oid)
            (let [old (walk (base e))]
              (swap! (record removals e) (conj record t))
              (swap! (record backwards t) (conj record e))
              (let [b (base e)
                    new (walk b)]
                (when (not (= new old)
                           (c (apply vector (if new 'input 'remove) (@assertions b)))))))
            (do 
              (swap! assertions assoc t tuple)
              (if (walk t)
                (c tuple)))))))))
;; handle flush here


(defn exec-delta-s [r d c terms]
  (let [state (ref {})
        handler (fn [t]
                  (condp = (r 0)
                    'insert (dosync
                             (let [x (@state t)]
                               (alter state assoc t (if x (+ x 1)
                                                        (do (c t) 1)))))
                    'remove (dosync
                             (let [x (@state t)]
                               (if (> x 1)
                                 (alter state assoc t (- x 1))
                                 (do (c t)
                                     (alter state dissoc t)))))))]
    (c (rset r (second terms) handler))))

(defn exec-send [r d c terms]
  (println "exec send" r terms)
  (let [msg (nth terms 2)
        res (if (empty? msg) [] (rget r (nth terms 2)))
        channel (rget r (second terms))]
    (channel res)
    (c r)))


(declare open)
(declare run)

(defn exec-open [r db c terms]
  (let [[open dest oid target] terms
        channel (db (rget r oid) (rget r target))]
    (c (rset r (second terms) channel))))
    
(defn exec-bind [r db c terms]
  (let [[bindo dest params body] terms
        stream (open db body (rget r params))]
    (c (rset r dest stream))))


;; i think we need register allocations regardless of the operation? except maybe flush and close?
(defn exec-allocate [r db c terms]
  (c (rset r (second terms) (vec (repeat (nth terms 2) nil)))))

(defn exec-move [r db c terms]
  (let [source (rget r (nth terms 2))]
    (c (rset r (second terms) source))))

;; these two are both the same, but at some point we may do some messing about
;; with numeric values (i.e. exact/inexact)
(defn ternary-numeric [f] 
  [(fn [r db c terms]
     (c (rset r (second terms)
                      (f (rget r (nth terms 2))
                         (rget r (nth terms 3))))))
   ignore-flush])
  
(defn ternary-numeric-boolean [f]
  [(fn [r db c terms]
     (c (rset r (second terms)
                      (f (rget r (nth terms 2))
                         (rget r (nth terms 3))))))
   ignore-flush])


(defn exec-str [r db c terms]
  (let [inputs (map (fn [x] (rget r x))
                    (rest (rest terms)))]
    (c (rset r (second terms) (apply str inputs)))))


(defn exec-range [r db c terms]
  (let [low  (rget r (nth terms 2))
        high (rget r (nth terms 3))]
    ;; need to copy the file here?
    (doseq [i (range low high)]
      (c (rset r (second terms) i)))))

  
(defn exec-filter [r db c terms]
  (if (rget r (second terms))
    (c r)
    r))

(defn exec-equal [r db c terms]
  (let [[eq dest s1 s2] terms
        t1 (rget r s1)
        t2 (rget r s2)]
    (c (rset r dest (= t1 t2)))))

(defn exec-not-equal [r db c terms]
  (c (rset r (nth terms 1)
                   (not (= (rget r (nth terms 2))
                           (rget r (nth terms 3)))))))



(defn exec-subquery [r d c terms]
  ;; this is some syntactic silliness - throw away the
  ;; projection
  (c (run d (second terms) r)))


(def command-map {'move      [exec-move      ignore-flush]
                  'filter    [exec-filter    ignore-flush]
                  '+         (ternary-numeric +)
                  '-         (ternary-numeric -)
                  '*         (ternary-numeric *)
                  '/         (ternary-numeric /)
                  '>         (ternary-numeric-boolean >)
                  '<         (ternary-numeric-boolean <)
                  '>=        (ternary-numeric-boolean >=)
                  '<=        (ternary-numeric-boolean <=)
                  'str       [exec-str       ignore-flush]
                  'range     [exec-range     ignore-flush]
                  'delta-s   [exec-delta-s   ignore-flush]
                  'delta-e   [exec-delta-e   ignore-flush]
                  'tuple     [exec-tuple     ignore-flush]
                  '=         [exec-equal     ignore-flush]
                  'sum       [exec-sum       exec-sum]
                  'sort      [exec-sort      exec-sort]
                  'subquery  [exec-subquery  exec-subquery]
                  'not-equal [exec-not-equal ignore-flush]
                  'open      [exec-open      ignore-flush]
                  'allocate  [exec-allocate  ignore-flush]
                  'send      [exec-send      exec-send]
                  'bind      [exec-bind      ignore-flush]
                  })


(defn run [d body reg]
  (println "run" d body reg)
  (if (empty? body) reg
      (let [command (first (first body))
            cf (command-map command)]
        (println "exec" command)
        (if (not cf)
          (println "bad command" command) 
          ((cf 0) reg d (fn [oreg]
                          (run d (rest body) oreg))
           (first body))))))


;; fix r in an eval
;;   0  operation
;;   1  context
;;   2  input
;;   3  self
;;   4  temp
;;   5  working    
  
  
 
(defn open [d program context]
  (fn [input]
    (run d program input)))

(defn execution-close [e]
  (e ['insert nil nil nil nil nil])
  (e 'close []))

(defn single [d prog out]
  (let [e (open d prog out)]
    (e ['insert nil nil nil nil nil])
    (e ['flush  nil nil nil nil nil])))
;; should just close  (e ['close out nil nil nil))))
