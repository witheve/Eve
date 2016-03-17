(ns server.exec
  (:require server.avl))


(defn ignore-flush [registers db c terms]
  (c registers))


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

(defn register-set [registers ref v]
  (let [c (count ref)]
    (cond 
      (= c 0) ()
      (= c 1) (if (> (ref 0) (count registers))
                (do (println "exec error" (ref 0) "is greater than" (count registers))
                    (throw c))
                (assoc registers (ref 0) v))
      :else 
      (assoc registers (ref 0) 
             (register-set (registers (ref 0)) (subvec ref 1) v)))))

(defn register-get [registers ref]
  (cond (not (vector? ref)) ref
        ;; special case of constant vector, empty
        (= (count ref) 0) ref
        ;; some persistent lists slip in here
        (= (count ref) 1) (nth registers (ref 0))
        :else 
        (register-get (registers (ref 0)) (subvec ref 1))))


;; support singletons?
(defn exec-tuple [registers db c terms]
  (c (register-set registers (second terms)
                (vec (map (fn [x] (register-get registers x)) (rest (rest terms)))))))


(defn exec-sort [registers db c terms]
  (let [state (fabric.avl/sorted-map)]
    (condp = (registers 0)
      'insert (conj state terms)
      'remove (disj state terms))))

;; sum cdest pararms body?
(defn exec-sum [registers db c terms]
  (let [total (atom 0)]
    (fn [t]
      (condp = (registers 0)
        'insert (swap! total (fn [x] (+ x (nth terms 2))))
        'remove (swap! total (fn [x] (- x (nth terms 2))))
        'flush (swap! total (fn [x] (- x (nth terms 2))))))))

      
(defn exec-delta [registers db c terms]
  (let [state (ref {})]
    (fn [t]
      (condp = (registers 0)
        'insert (dosync
                 (let [x (@state t)]
                   (alter state assoc t (if x (+ x 1)
                                            (do (c t) 1)))))
        'remove (dosync
                 (let [x (@state t)]
                   (if (> x 1)
                     (alter state assoc t (- x 1))
                     (do (c t)
                         (alter state dissoc t)))))
        :else
        (c t)))))

(defn exec-send [registers d c terms]
  (println "exec send" registers terms)
  (let [msg (nth terms 2)
        res (if (empty? msg) [] (register-get registers (nth terms 2)))
        channel (register-get registers (second terms))]
    (channel res)
    (c registers)))


(declare open)
(declare run)

(defn exec-open [registers db c terms]
  (let [[open dest oid target] terms
        channel (db (register-get registers oid) (register-get registers target))]
    (c (register-set registers (second terms) channel))))
    
(defn exec-bind [registers db c terms]
  (let [[bindo dest params body] terms
        stream (open db body (register-get registers params))]
    (c (register-set registers dest stream))))


;; i think we need register allocations regardless of the operation? except maybe flush and close?
(defn exec-allocate [registers db c terms]
  (c (register-set registers (second terms) (vec (repeat (nth terms 2) nil)))))

(defn exec-move [registers db c terms]
  (let [source (register-get registers (nth terms 2))]
    (c (register-set registers (second terms) source))))

;; these two are both the same, but at some point we may do some messing about
;; with numeric values (i.e. exact/inexact)
(defn ternary-numeric [f] 
  [(fn [registers db c terms]
     (c (register-set registers (second terms)
                      (f (register-get registers (nth terms 2))
                         (register-get registers (nth terms 3))))))
   ignore-flush])
  
(defn ternary-numeric-boolean [f]
  [(fn [registers db c terms]
     (c (register-set registers (second terms)
                      (f (register-get registers (nth terms 2))
                         (register-get registers (nth terms 3))))))
   ignore-flush])


(defn exec-str [registers db c terms]
  (let [inputs (map (fn [x] (register-get registers x))
                    (rest (rest terms)))]
    (c (register-set registers (second terms) (apply str inputs)))))


(defn exec-range [registers db c terms]
  (let [low  (register-get registers (nth terms 2))
        high (register-get registers (nth terms 3))]
    ;; need to copy the file here?
    (doseq [i (range low high)]
      (c (register-set registers (second terms) i)))))

  
(defn exec-filter [registers db c terms]
  (if (register-get registers (second terms))
    (c registers)
    registers))

(defn exec-equal [registers db c terms]
  (let [[eq dest s1 s2] terms
        t1 (register-get registers s1)
        t2 (register-get registers s2)]
    (c (register-set registers dest (= t1 t2)))))

(defn exec-not-equal [registers db c terms]
  (c (register-set registers (nth terms 1)
                   (not (= (register-get registers (nth terms 2))
                           (register-get registers (nth terms 3)))))))


(defn exec-subquery [registers d c terms]
  ;; this is some syntactic silliness - throw away the
  ;; projection
  (c (run d (second terms) registers)))


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
                  'delta     [exec-delta     ignore-flush]
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


;; fix registers in an eval
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
