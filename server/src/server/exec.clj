(ns server.exec
  (:require [server.edb :as edb]
            [clojure.test :as test]
            [server.avl :as avl]
            [clojure.pprint :refer [pprint cl-format]]))

(def basic-register-frame 10)
(def op-register [0])
(def taxi-register [1])
(def temp-register [2])
(def initial-register 3)

(def object-array-type (class (object-array 1)))

(defn third [x] (nth x 2))

(declare build)

(defn print-registers*
  ([r] (print-registers* r #{} 1))
  ([r visited indent]
     (reduce (fn [memo x]
               (let [padding (apply str (repeat indent "  "))
                     append-memo (fn [slot]
                              {:slot (inc (:slot memo))
                               :nests (:nests memo)
                               :register (str (:register memo)
                                              (when (:register memo) " ")
                                              (cl-format nil "~4@a" slot))})
                     nest-memo (fn [nest]
                                 {:slot (inc (:slot memo))
                                  :nests (str (:nests memo) (when (:nests memo) "\n" ) padding
                                              "#" (:slot memo) ": " nest)
                                  :register (str (:register memo)
                                                 (when (:register memo) " ")
                                                 (cl-format nil "~4@a" (str "#" (:slot memo))))})]
                 (cond
                  (fn? x) (append-memo "λ")
                  (nil? x) (append-memo ".")
                  (= x ()) (append-memo "()")
                  (visited x) (append-memo "*")
                  (= object-array-type (type x)) (if (< indent 2)
                                                   (nest-memo
                                                    (let [nested (print-registers* x (conj visited x) (inc indent))]
                                                      (apply str (:register nested) (:nests nested))))
                                                   (append-memo "<snip>"))
                  ;;:else (nest-memo (str x)))))
                  :else (append-memo (str x)))))
             {:slot 0 :nests "" :register ""} r)))

(defn print-registers [r]
  (let [nested (print-registers* r)]
    (str (:register nested) (:nests nested))))

;; these register indirections could be resolved at build time? yeah, kinda
;; no longer support the implicit zero register

(defn rget [r ref]
  (cond (not (vector? ref))
        (if (= ref '*)
          r
          ref)
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
      (when (or (= (rget r op-register) 'insert)
                (= (rget r op-register) 'remove))
        (f r terms))
      (c r))))



(defn delta-t [c]
  (let [state (atom {})]
    [(fn [r]
       (let [tuple (subvec (vec r) 1)]
         (condp = (rget r op-register)
           'insert (swap! state update-in [tuple] (fn [x]
                                                    (if x
                                                      [(x 0) (+ (x 1) 1)]
                                                      [tuple 1])))

           'remove (swap! state update-in [tuple] (fn [x] (if (= (x 1) 1) nil
                                                              [(x 0) (- (x 1) 1)])))
           ())
         (c r)))

     (fn [c2 op]
       (doseq [i @state] (c2 (object-array (cons op (i 0))))))]))


(defn donot [d terms build c]
  (let [count (atom 0)
        on (atom false)
        zig (atom false)
        tail  (fn [r]
                (condp = (rget r op-register)
                  'insert (swap! count inc)
                  'remove  (swap! count dec)
                  'flush (do
                           (when (and (= @count 0) (not @on))
                             (@zig c 'insert)
                             (swap! on not))
                           (when (and (> @count 0) @on)
                             (@zig c 'remove)
                             (swap! on not))
                           (c r))
                  'close (c r)))
        delta (delta-t (build (second terms) tail))]
    (reset! zig (delta 1))
    (delta 0)))


(defn tuple [d terms build c]
  (fn [r]
    (when (and (not= (rget r op-register) 'flush)  (not= (rget r op-register) 'close))
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

;; this is just a counting version of
;; join, that may be insufficient if
;; there are multiple flushes in the pipe
;; i.e. identifiying the flushes, or the upstream
;; legs and doing a merge-like thing
(defn dojoin [d terms build c]
  (let [total (second terms)
        flushes (atom 0)
        closes (atom 0)
        ;; transactions
        update (fn [c r x]
                 (when (= (swap! x inc) total)
                   (do
                     (reset! x 0)
                     (c r))))]

    (fn [r]
      (condp = (rget r op-register)
        'flush (update c r flushes)
        'close  (update c r closes)
        (c r)))))


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
            op (rget r op-register)
            value-slot (nth terms 2)
            grouping-slots (nth terms 3)
            grouping (if (> (count grouping-slots) 0)
                       (map #(rget r %1) grouping-slots)
                       (list 'default))]

        (if (or (= op 'flush) (= op 'close))
          (c r)
          (do
            (condp = (rget r op-register)
              'insert (swap! totals update-in grouping (fnil + 0) (rget r value-slot))
              'remove (swap! totals update-in grouping (fnil - 0) (rget r value-slot))
              ())

            (rset r out-slot (get-in @totals grouping))
            (c r)

            (when-not (nil? (get-in @prevs grouping nil))
              (rset r op-register 'remove) ;; @FIXME: This needs to copied to be safe asynchronously
              (rset r out-slot (get-in @prevs grouping))
              (c r))
            (swap! prevs assoc-in grouping (get-in @totals grouping))))))))

;; I'm a bad, bad man
(defn make-comparator [sorting]
  (eval `(fn [~'a ~'b]
     ~(reduce (fn [memo [ix dir]]
                (let [[before after] (if (= dir "ascending") ['< '>] ['> '<])]
                  `(if (~before (get ~'a ~ix) (get ~'b ~ix))
                     -1
                     (if (~after (get ~'a ~ix) (get ~'b ~ix))
                       1
                       ~memo))))
              0
              (reverse sorting)))))

(defn get-sorted-ix [coll sorting value]
  (println "COLL" coll "SORTING" sorting "VALUE" value)
  (if (or (nil? coll) (empty? coll))
    0
    (let [compare (make-comparator sorting)]
      (loop [bounds (quot (count coll) 2)
             ix bounds]
        (let [other (get coll ix)
              delta (compare value other)
              half (quot bounds 2)]
          (println "LOOP" "H" bounds "IX" ix  "VALUE" value "OTHER" other "DELTA" delta)
          (if-not (zero? bounds)
            (if (> delta 0)
              (recur half
                     (min (+ ix bounds) (dec (count coll))))
              (if (< delta 0)
                (recur half
                       (max (- ix bounds) 0))
                (inc ix)))
            (if (< (compare value (get coll ix)) 0)
              ix
              (inc ix))))))))

;; (defn sort-facts [d terms build c]
;;   (let [ordinals (atom {})
;;         prevs (atom {})]
;;     (fn [r]
;;       (let [out-slot (second terms)
;;             op (rget r op-register)
;;             value-slot (nth terms 2)
;;             grouping-slots (nth terms 3)
;;             grouping (if (> (count grouping-slots) 0)
;;                        (map #(rget r %1) grouping-slots)
;;                        (list 'default))]

;;         (if (or (= op 'flush) (= op 'close))
;;             (c r)
;;           (do
;;             (condp = (rget r op-register)
;;               'insert (swap! totals update-in grouping (fnil + 0) (rget r value-slot))
;;               'remove (swap! totals update-in grouping (fnil - 0) (rget r value-slot))
;;               ())

;;             (rset r out-slot (get-in @totals grouping))
;;             (c r)

;;             (when-not (nil? (get-in @prevs grouping nil))
;;               (rset r op-register 'remove) ;; @FIXME: This needs to copied to be safe asynchronously
;;               (rset r out-slot (get-in @prevs grouping))
;;               (c r))
;;             (swap! prevs assoc-in grouping (get-in @totals grouping))))))))

(defn delta-c [d terms build c]
  (let [[_ & proj] terms
        proj (if proj proj [])
        assertions (atom {})]
    (fn [r]
      (let [fact (reduce #(assoc %1 %2 (rget r %2)) {} proj)
            prev (get @assertions fact 0)]
        (condp = (rget r op-register)
          'insert (swap! assertions update-in [fact] (fnil inc 0))
          'remove (swap! assertions update-in [fact] dec)
          'flush (c r)
          'close (c r))
        (let [cur (get @assertions fact 0)]
          (cond
            (and (> cur 0) (= prev 0)) (c r)
            (and (= cur 0) (> prev 0)) (do
                                         (rset r op-register 'remove)
                                         (c r))))))))

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
      (if (= (rget r op-register) 'insert)
        (let [[e a v b t u] (rget r in)]

          (if (= a edb/remove-oid)
            (let [b (base e)
                  old (if b (walk b) b)]
              (swap! (record down t) conj e)
              (swap! (record up e) conj t)
              (let [nb (if b b (base e))
                    new (if nb (walk nb) nb)]
                (cond (and (not old) new) (do (rset r out in)
                                              (c r))
                      (and old (not new)) (do (rset r out (@assertions b))
                                              (rset r op-register 'remove)
                                              (c r)))))

            (do
              (swap! assertions assoc t (rget r in))
              (when (walk t)
                (rset r out (rget r in))
                (c r)))))
        (c r)))))



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
      (channel (if (or
                    (= (rget r op-register) 'flush)
                    (= (rget r op-register) 'close))
                 r nregs))
      (c r))))


(defn doscan [d terms build c]
  (let [[scan oid dest key] terms
        opened (atom ())
        scan (fn [r]
               (let [handle (d 'insert oid (rget r key)
                               (fn [t op]
                                 (rset r op-register op)
                                 (when (= op 'insert)
                                   (rset r dest t))
                                 (c r)))]
                 (swap! opened conj handle)))]


    (fn [r]
      (condp = (rget r op-register)
        'insert (scan r)
        'remove (scan r)
        'close (do
                 (doseq [i @opened] (i))
                 (c r))
        'flush (do (when (= oid edb/insert-oid)
                     (d 'flush oid [] (fn [k op] (c r))))
                   (c r))))))



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
                  'not=      (simple do-not-equal)

                  'filter    dofilter
                  'range     dorange
                  'delta-s   delta-s
                  'delta-e   delta-e
                  'delta-c   delta-c
                  'tuple     tuple
                  '=         (simple doequal)
                  'sum       sum
                  'sort      dosort
                  'not       donot

                  'scan      doscan
                  'send      dosend
                  'join      dojoin
                  })

;; this needs to send an error message down the pipe
(defn exec-error [reg comment]
  (throw (ex-info comment {:registers reg :type "exec"})))

(defn build [name names built d t wrap final]
  (if (= name 'out) final
      (let [doterms (fn doterms [t down]
                      (if (empty? t) down
                          (let [m (meta (first t))
                                z (if (= (first (first t)) 'send)
                                    (let [target (second (first t))]
                                      (list 'send
                                            (if-let [c (@built target)] c
                                                    (build target names built d (@names target) wrap final))
                                            (third (first t))))
                                    (first t))
                                k (first z)]
                            (if-let [p (command-map (first z))]
                              (wrap (first t) m (p d z doterms (doterms (rest t) down)))
                              (exec-error [] (str "bad command" k))))))
            trans (doterms t (fn [r] ()))]
        (swap! built assoc name trans)
        trans)))


;; fuse notrace and trace versions
(defn open [d program callback trace-p]
  (let [reg (object-array basic-register-frame)
        blocks (atom {})
        built (atom {})
        tf (if trace-p
             (fn [n m x] (fn [r] (println "trace" n m) (println (print-registers r)) (x r)))
             (fn [n m x] x))
        _ (doseq [i program]
            (swap! blocks assoc (second i) (nth i 2)))
        e (build 'main blocks built d (@blocks 'main) tf
                 callback)]

    (fn [op]
      (rset reg op-register op)
      (e reg))))


(defn single [d prog out]
  (let [e (open d prog (fn [r]
                         (when (= (rget r op-register) 'insert) (out r))) false)]
    (e 'insert)
    (e 'flush)
    (e 'close)))
