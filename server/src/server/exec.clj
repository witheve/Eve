(ns server.exec
  (:require server.avl))


(defn print-program [p]
  (letfn [(bastards [x] (or (list? x) (= (type x) clojure.lang.Cons)))
          (traverse [x indent]
            (cond
              ;; assholes
              (instance? clojure.lang.LazySeq x) (traverse (apply list (doall x)) indent)
              
              ;; reduce on () does someting unspeakable
              (and (bastards x) (empty? x)) "()"
              
              (and (bastards x) (bastards (first x)))
              (reduce (fn [y x] (str y "\n" x)) ""
                      (map (fn [z]  (str (apply str (repeat indent " "))
                                         (traverse z (+ indent 4)))) x))
              
              (bastards x)
              (str "(" (reduce (fn [y x] (str y " " x))
                               (map (fn [z] (traverse z indent)) x)) ")")
              
              (or (number? x) (string? x) (symbol? x) (vector? x)) (str x)
              :else (str "<unknown>")))]
    (traverse p 0)))

(defn register-set [registers ref v]
  (let [c (count ref)]
    (cond ;; special case of 0 being myself
      (= c 0) ()
      (and (= c 1) (= (ref 0) 0))  v
      (= c 1) (if (> (ref 0) (count registers))
                (println "exec error" (ref 0) "is greater than" (count registers))
                (assoc registers (ref 0) v))
      :else 
      (assoc registers (ref 0) 
             (register-set (registers (ref 0)) (subvec ref 1) v)))))

(defn register-get [registers ref]
  (cond (not (vector? ref)) ref
        ;; special case of constant vector, empty
        (= (count ref) 0) ref
        (and (= (count ref) 1) (= ref 0)) registers
        ;; some persistent lists slip in here
        (= (count ref) 1) (nth registers (ref 0))
        :else 
        (register-get (registers (ref 0)) (subvec ref 1))))


;; support singletons?
(defn exec-tuple [registers db op c terms]
  (c op (register-set registers (second terms)
                (vec (map (fn [x] (register-get registers x)) (rest (rest terms)))))))


(defn exec-sort [registers db op c terms]
  (let [state (fabric.avl/sorted-map)]
    (cond
      (= op 'insert) (conj state terms)
      (= op 'remove) (disj state terms))
    ()
    ))




      ;; not sure floating this is correct...but you know, hey
      ;; really want flush or remove
(defn exec-op [registers db op c terms]
    (c op (register-set (second terms) op)))


(defn exec-sum [registers db op c terms]
  (let [total (atom 0)]
    (fn [op t]
      (cond
        (= op 'insert) (swap! total (fn [x] (+ x (nth terms 2))))
        (= op 'remove) (swap! total (fn [x] (- x (nth terms 2))))
        (= op 'flush) (swap! total (fn [x] (- x (nth terms 2))))))))

      
(defn exec-delta [registers db op c terms]
  (let [state (ref {})]
    (fn [op t]
      (cond
        (= op 'insert) (dosync
                        (let [x (@state t)]
                          (alter state assoc t (if x (+ x 1)
                                                   (do (c op t) 1)))))
        (= op 'remove) (dosync
                        (let [x (@state t)]

                          (if (> x 1)
                            (alter state assoc t (- x 1))
                            (do (c op t)
                                (alter state dissoc t)))))
        :else
        (c op t)))))

  
(defn exec-compile [registers c terms]
  ())

(defn exec-send [registers db op c terms]
  (let [res (register-get registers (nth terms 2))
        channel (register-get registers (second terms))]
    (channel 'insert res)
    (c op registers)))


(declare open)
(declare run)

(defn exec-open [registers db op c terms]
  (let [[open dest oid target] terms
        ;; oid-open-map can fail.
        k (println "open channel" db (type (register-get registers target)))
        channel (db (register-get registers oid) (register-get registers target))]
    (c op (register-set registers (second terms) channel))))
    

(defn exec-bind [registers db op c terms]
  (println "exec bind" db)
  (let [[bindo dest params body] terms
        stream (open db body (register-get registers params))]
    (c op (register-set registers dest stream))))


;; i think we need register allocations regardless of the operation? except maybe flush and close?
(defn exec-allocate [registers db op c terms]
  (c op (register-set registers (second terms) (vec (repeat (nth terms 2) nil)))))

(defn exec-move [registers db op c terms]
  (let [source (register-get registers (nth terms 2))]
    (c op (register-set registers (second terms) source))))

(defn exec-plus [registers db op c terms]
  (c op (register-set registers (second terms)
            (+ (register-get registers (nth terms 2))
               (register-get registers (nth terms 3))))))

(defn exec-str [registers db op c terms]
  (let [inputs (map (fn [x] (register-get registers x))
                    (rest (rest terms)))]
    (c op (register-set registers (second terms) (apply str inputs)))))


(defn exec-range [registers db op c terms]
  (let [low  (register-get registers (nth terms 2))
        high (register-get registers (nth terms 3))]
    ;; need to copy the file here?
    (doseq [i (range low high)]
      (c op (register-set registers (second terms) i)))))

  
(defn exec-times [registers db op c terms]
  (c (register-set registers (second terms)
            (* (register-get registers (nth terms 2))
               (register-get registers (nth terms 3))))))

(defn exec-filter [registers db op c terms]
  (and (register-get registers (second terms))
       (c op registers)))
  
(defn exec-less? [registers db c terms] '())

;; ok, this is the binary template, we could even macroize it
(defn exec-equal [registers db op c terms] '()
  (let [[eq dest s1 s2] terms
        t1 (register-get registers s1)
        t2 (register-get registers s2)]
    (c op (register-set registers dest (= t1 t2)))))

(defn exec-not-equal [registers db op c terms] '()
  (c op (register-set registers (nth terms 1)
                   (not (= (register-get registers (nth terms 2))
                           (register-get registers (nth terms 3)))))))

(defn exec-subquery [registers db op c terms] '()
  (run (second terms) registers db)
  (c op registers))

(def command-map {'move exec-move
                  'filter exec-filter
                  '+ exec-plus
                  '* exec-times
                  'str exec-str
                  'range exec-range
                  'delta exec-delta
                  'tuple exec-tuple
                  'equal exec-equal
                  'sum exec-sum
                  'sort exec-sort
                  'subquery exec-subquery
                  'not-equal exec-not-equal
                  'less? exec-less?
                  'open exec-open
                  'allocate exec-allocate
                  'send exec-send
                  'bind exec-bind
                  'compile exec-compile
                  })


(defn run [db body reg op]
  (and (not (empty? body))
       (let [command (first (first body))
             cf (command-map command)]
         (if (not cf)
           (println "bad command" command) 
           (cf reg
               db
               op
               (fn [op oreg]
                 (run db (rest body) oreg op))
               (first body))))))


(defn open [db program context]
  (println "exec open" db program)
  (fn [op input]
    ;; not 10, we need to fix the self-allocation problemo
    (let [framesize 10
          b (vec (repeat framesize nil))
          b1 (if (> (count context) 0) (register-set b [2] context) b)
          b2 (if (> (count input) 0) (register-set b1 [1] input) b1)]
      (run db program b2 op))))

(defn execution-close [e]
  (e 'close []))
