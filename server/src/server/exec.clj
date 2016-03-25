(ns server.exec
  (:require [server.edb :as edb]
            [clojure.test :as test]
            [server.avl :as avl]))

(def basic-register-frame 10)
(def op-register [1])
(def bag-register [2])
(def input-register [3])
(def temp-regiter [4])

(def object-array-type (class (object-array 1)))

;; fold op back into r
(declare build)

(defn print-registers [r]
  (map (fn [x]
         (cond
           (fn? x) "λ " 
           (nil? x) ". "
           (= x ()) "()"
           (= object-array-type (type x)) (print-registers x)
           :else (str x)))
       r))


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

;; these register indirections could be resolved at build time? yeah, kinda


(defn rget [r ref]
  (cond (not (vector? ref)) ref
        ;; special case of constant vector, empty
        (= (count ref) 0) ref
        (= (count ref) 1) (aget r (ref 0))
        :else 
        (rget (aget r (ref 0)) (subvec ref 1))))

(defn rset [r ref v]
  (let [c (count ref)]
    (cond 
      (= c 0) ()
      (= c 1) (if (> (ref 0) (count r))
                (do (println "exec error" (ref 0) "is greater than" (count r))
                    (throw c))
                (aset r (ref 0) v))
      :else 
      (rset (aget r (ref 0)) (subvec ref 1) v))))


;; simplies - cardinality preserving, no flush


;; flushes just roll on by
(defn simple [f]
  (fn [db terms c]
    (fn [r]
      (when (= (rget r op-reg) 'insert)
        (f r terms))
      (c r))))
    

(defn doprint [r terms]
  (println (map (fn [x] (rget r x)) terms)))
  
(defn allocate [r terms]
  (rset r (second terms) (vec (repeat (nth terms 2) nil))))

(defn tuple [d terms c]
  (fn [r]
    (rset r (second terms)
          (object-array (map (fn [x] (rget r x)) (rest (rest terms)))))
    (c r)))

;; these two are both the same, but at some point we may do some messing about
;; with numeric values (i.e. exact/inexact)
(defn ternary-numeric [f]
  (simple (fn [r terms]
            (rset r (second terms)
                  (f (rget r (nth terms 2))
                     (rget r (nth terms 3)))))))

  
(defn ternary-numeric-boolean [f]
  (simple (fn [r terms]
            (rset r (second terms)
                  (f (rget r (nth terms 2))
                     (rget r (nth terms 3)))))))

(defn move [r terms]
  (let [source (rget r (nth terms 2))]
    (rset r (second terms) source)))

(defn dostr [r terms]
  (let [inputs (map (fn [x] (rget r x))
                    (rest (rest terms)))]
     (rset r (second terms) (apply str inputs))))

(defn doequal [r terms]
  (let [[eq dest s1 s2] terms
        t1 (rget r s1)
        t2 (rget r s2)]
    (rset r dest (= t1 t2))))

(defn do-not-equal [r terms]
   (rset r (nth terms 1)
         (not (= (rget r (nth terms 2))
                 (rget r (nth terms 3))))))



;; staties


(defn dorange [d terms c]
  (fn [r]
    (let [low  (rget r (nth terms 2))
          high (rget r (nth terms 3))]
      ;; need to copy the file here?
      (doseq [i (range low high)]
        (c (rset r (second terms) i))))))


(defn dofilter [d terms c]
  (fn [r]
    ;; pass flush    
    (when (rget r (second terms))
      (c r))))


(defn dosort [d terms c]
  (fn [r]
    (let [state (avl/sorted-map)]
      (condp = (rget r op-reg)
        'insert (conj state terms)
        'remove (disj state terms)))))

(defn sum [d terms c]
  (fn [r]
    (let [total (atom 0)]
      (fn [t]
        (condp = (rget r op-reg)
          'insert (swap! total (fn [x] (+ x (nth terms 2))))
          'remove (swap! total (fn [x] (- x (nth terms 2))))
          'flush (swap! total (fn [x] (- x (nth terms 2)))))))))



;; down is towards the base facts, up is along the removal chain
;; use stm..figure out a way to throw down..i guess since r
;; is mutating now
(defn delta-e [d terms c]
  (let [[delto out in] terms
        assertions (atom {})
        record (fn [m k] (if-let [r (@m key)] r
                                 ((fn [r] (swap! m assoc k r) r)
                                  (atom #{}))))
        up (atom {})
        down (atom {})
        base (fn base [t]
               (cond
                 (not t) t
                 (contains? @assertions t) t
                 :else
                 (base (@down t))))
        
        walk (fn walk [t] 
               (let [k (@up t)]
                 (if (= k nil) true
                     (not (some walk @k)))))]
    
    (fn [r]
      (let [[e a v b t u] (rget r in)]
        (if (= (rget r op-reg) 'insert)
          (if (= a edb/remove-oid)
            (let [b (base e)
                  old (if b (walk b) b)]
              (swap! (record down t) conj e)
              (swap! (record up e) conj t)
              (let [nb (if b b (base e))
                    new (if nb (walk nb) nb)]
                (cond (and (not old) new) (do (rset r out in)
                                              (c r))
                      (and old (not new)) (do (rset r out in)
                                              (rset r op-reg 'remove)
                                              (c r)))))

            (do 
              (swap! assertions assoc t tuple)
              (when (walk t)
                (rset r out (rget r in))
                (c r)))))))))


(defn delta-s [d terms c]
  (let [state (ref {})
        handler (fn [r]
                  (let [t (rget r (first r))]
                    (condp = (rget r op-reg)
                      'insert (dosync
                               (let [x (@state t)]
                                 (alter state assoc t (if x (+ x 1)
                                                          (do (c t) 1)))))
                      'remove (dosync
                               (let [x (@state t)]
                                 (if (> x 1)
                                   (alter state assoc t (- x 1))
                                   (do (c t)
                                       (alter state dissoc t))))))))]
    (fn [r]
      (c (rset r (second terms) (handler r))))))

(defn dosend [d terms c]
  (fn [r]
    (let [channel (rget r (second terms))]
      ;; currently this signature is different, because we dont want our
      ;; external guys to try to deconstruct the working tuple...not sure how
      ;; this works for internal sends (?)
      (channel (rget r op-reg) (rget r (nth terms 2)))
      (c r))))

;; something awfully funny going on with the op around the scan
;; this should always emit the whole tuple, regardless of whether
;; or not there were inputs, so we can use the delta-e without
;; specializing (?)
(defn doscan [d terms c]
  (let [[scan oid dest key] terms]
    (fn [r]
      (if (= (rget r op-reg) 'insert)
        ((d oid 
            (fn [t]
              ;; ahem, who else might be looking at this?
              (rset r op-reg 'insert)
              (rset r dest t)
              (c r)))
         (rget r key))
        (c r)))))

    
(defn bind [d terms c]
  (fn [r]
    (let [[bindo dest body] terms
          child (build d (second terms) r)]
      (c (rset r dest child)))))


(defn subquery [d terms c]
  (let [subguy (build d (second terms))]
    (fn [r]
      (subguy r)
      (c r))))


(def command-map {'move      (simple move)
                  '+         (ternary-numeric +)
                  '-         (ternary-numeric -)
                  '*         (ternary-numeric *)
                  '/         (ternary-numeric /)
                  '>         (ternary-numeric-boolean >)
                  '<         (ternary-numeric-boolean <)
                  '>=        (ternary-numeric-boolean >=)
                  '<=        (ternary-numeric-boolean <=)
                  'str       (simple dostr)
                  'not-equal (simple do-not-equal)
                  'allocate  (simple allocate)
                  'print     (simple doprint)

                  'filter    dofilter    
                  'range     dorange     
                  'delta-s   delta-s   
                  'delta-e   delta-e   
                  'tuple     tuple     
                  '=         (simple doequal)
                  'sum       sum       
                  'sort      dosort      
                  'subquery  subquery  

                  'scan      doscan     
                  'send      dosend   
                  'bind      bind  
                  })

;; this needs to send an error message down the pipe
(defn exec-error [reg comment]
  (println "exec error" comment))


(defn build-trace [d t]
  (if (empty? t) (fn [r] ())
      (let [k (first t)]
        (if-let [p (command-map (first k))]
          (let [f (p d k (build-trace d (rest t)))]
            (fn [r]
              (println (first t) (print-registers r))
              (f r)))
          (exec-error (str "bad command" k))))))

(defn open-trace [d program arguments]
  (let [reg (object-array 10)
        e  (build-trace d program)]
    (aset reg 1 arguments)
    (fn [op]
      (rset reg [3] op)
      (e reg))))


(defn build [d t]
  (if (empty? t) (fn [r] ())
      (let [k (first t)]
        (if-let [p (command-map (first k))]
          (p d k (build d (rest t)))
          (exec-error (str "bad command" k))))))


;; fix r in an eval
;;   0  root
;;   1  arguments
;;   2  bag default
;;   3  op
(defn open [d program arguments]
  (let [reg (object-array basic-register-frame)
        e  (build d program)]
    (aset reg 1 arguments)
    (fn [op]
      (rset reg [3] op)
      (e reg))))
      

(defn single [d prog out]
  (let [e (open d prog out)]
    (e 'insert)
    (e 'flush)))

