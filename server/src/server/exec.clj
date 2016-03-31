(ns server.exec
  (:require [server.edb :as edb]
            [clojure.test :as test]
            [server.avl :as avl]
            [clojure.pprint :refer [pprint]]))

(def basic-register-frame 10)
(def op-register [0])
(def input-register [1])
(def temp-register [2])

(def object-array-type (class (object-array 1)))

(defn third [x] (nth x 2))

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
;; no longer support the implicit zero register

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
  (fn [db terms build c]
    (fn [r]
      (when (= (rget r op-register) 'insert)
        (f r terms))
      (c r))))



;; there are no terms to a delta-t
(defn delta-t [d terms build c]
  (let [state (atom {})]
    (fn [r]
      (let [tuple (subvec (vec r) 1)]
        (condp = (rget r op-register)
          'insert (swap! state update-in [tuple] (fn [x]
                                                   (if x
                                                     [(x 0) (+ (x 1) 1)]
                                                     [tuple 1])))
          'remove (swap! state update-in [tuple] (fn [x] (if (= (x 1) 1) nil
                                                             [(x 0) (- (x 1) 1)])))
          
          'flush (c r)
          ;; shallow copy
          'rdrain (doseq [i @state] (c (object-array (cons 'remove i))))
          'idrain (doseq [i @state] (c (object-array (cons 'insert i)))))))))

(defn donot [d terms build c]
  (let [count (atom 0)
        on (atom false)
        delta (delta-t d () build c)
        tail  (fn [r]
                (condp = (rget r op-register)
                  'insert (swap! count inc)
                  'remove (swap! count dec)))

        internal (build (second terms) tail)]
    (fn [r]
      (internal r)
      (when (= (rget r op-register) 'flush)
        (when (and (= @count 0) (not @on))
          (delta (object-array '(idrain)))
          (swap! on not))
        (when (and (> @count 0) @on)
          (delta (object-array '(rdrain)))
          (swap! on not)))
      (delta r))))



(defn tuple [d terms build c]
  (fn [r]
    (when (not= (rget r op-register) 'flush)
      (let [a (rest (rest terms))
            ;; since this is often a file, we currently force this to be at least the base max frame size
            tout (object-array (max (count a) basic-register-frame))]
        (doseq [x (range (count a))]
          (aset tout x (rget r (nth a x))))
        (rset r (second terms) tout)))
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


(defn dorange [d terms build c]
  (fn [r]
    (let [low  (rget r (nth terms 2))
          high (rget r (nth terms 3))]
      ;; need to copy the file here?
      (doseq [i (range low high)]
        (c (rset r (second terms) i))))))


(defn dofilter [d terms build c]
  (fn [r]
    ;; pass flush
    (when (rget r (second terms))
      (c r))))


(defn dosort [d terms build c]
  (fn [r]
    (let [state (avl/sorted-map)]
      (condp = (rget r op-register)
        'insert (conj state terms)
        'remove (disj state terms)))))

(defn sum [d terms build c]
  (let [totals (atom {})
        prevs (atom {})]
    (fn [r]
      (let [out-slot (second terms)
            value-slot (nth terms 2)
            grouping-slots (nth terms 3)
            grouping (map #(rget r %1) grouping-slots)]

        (condp = (rget r op-register)
          'insert (swap! totals update-in grouping (fnil + 0) (rget r value-slot))
          'remove (swap! totals update-in grouping (fnil - 0) (rget r value-slot)))

        (rset r out-slot (get-in @totals grouping))
        (c r)

        (when-not (= (rget r op-register) 'flush)
          (when-not (nil? (get-in @prevs grouping nil))
            (rset r op-register 'remove) ;; @FIXME: This needs to copied to be safe asynchronously
            (rset r out-slot (get-in @prevs grouping))
            (c r))
          (swap! prevs assoc-in grouping (get-in @totals grouping)))))))

;; down is towards the base facts, up is along the removal chain
;; use stm..figure out a way to throw down..i guess since r
;; is mutating now
(defn delta-e [d terms build c]
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
        (if (= (rget r op-register) 'insert)
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
                                              (rset r op-register 'remove)
                                              (c r)))))

            (do
              (swap! assertions assoc t tuple)
              (when (walk t)
                (rset r out (rget r in))
                (c r)))))))))



                


(defn delta-s [d terms build c]
  (let [state (ref {})
        handler (fn [r]
                  (let [t (rget r (first r))]
                    (condp = (rget r op-register)
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

(defn dosend [d terms build c]
  (fn [r]
    (let [channel (rget r (second terms))
          nregs (rget r (third terms))]
      (channel (if (= (rget r op-register) 'flush) r nregs))
      (c r))))

;; something awfully funny going on with the op around the scan
;; this should always emit the whole tuple, regardless of whether
;; or not there were inputs, so we can use the delta-e without
;; specializing (?)
(defn doscan [d terms build c]
  (let [[scan oid dest key] terms]
    (fn [r]
      (if (= (rget r op-register) 'insert)
        ((d oid
            (fn [t]
              (rset r op-register 'insert)
              (rset r dest t)
              (c r)))
         (rget r key))
        (c r)))))


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

                  'filter    dofilter
                  'range     dorange
                  'delta-s   delta-s
                  'delta-e   delta-e
                  'tuple     tuple
                  '=         (simple doequal)
                  'sum       sum
                  'sort      dosort
                  'not       donot

                  'scan      doscan
                  'send      dosend
                  })

;; this needs to send an error message down the pipe
(defn exec-error [reg comment]
  (throw (ex-info comment {:registers reg :type "exec"})))

(defn build [name names built d t wrap final]
  (if (= name 'out) final
      (let [doterms (fn doterms [t down]
                      (if (empty? t) (fn [r] ())
                          (let [z (if (= (first (first t)) 'send)
                                    (let [target (second (first t))]
                                      (list 'send
                                            (if-let [c (@built target)] c
                                                    (build target names built d (@names target) wrap down))
                                            (third (first t))))
                                    (first t))
                                k (first z)]
                            (if-let [p (command-map (first z))]
                              (wrap (first t) (p d z doterms (doterms (rest t) final)))
                              (exec-error [] (str "bad command" k))))))
            trans (doterms t final)]
        (swap! built assoc name trans)
        trans)))


;; fuse notrace and trace versions
(defn open [d program arguments]
  (let [reg (object-array basic-register-frame)
        blocks (atom {})
        built (atom {})
        _ (doseq [i program]
            (swap! blocks assoc (second i) (nth i 2)))
        e (build 'main blocks built d (@blocks 'main)
                 (fn [n x] x)
                 arguments)]

    (rset reg input-register arguments)
    (fn [op]
      (rset reg op-register op)
      (e reg))))

(defn open-trace [d program arguments]
  (let [reg (object-array basic-register-frame)
        blocks (atom {})
        built (atom {})
        _ (doseq [i program]
            (swap! blocks assoc (second i) (nth i 2)))
        e (build 'main blocks built d (@blocks 'main)
                 (fn [n x] (fn [r] (println "trace" n (print-registers r)) (x r)))
                 arguments)]

    (rset reg input-register arguments)
    (fn [op]
      (rset reg op-register op)
      (e reg))))


(defn single [d prog out]
  (let [e (open d prog out)]
    (e 'insert)
    (e 'flush)))
