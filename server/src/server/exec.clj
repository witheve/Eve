(ns server.exec
  (:require [server.edb :as edb]
            [clojure.pprint :refer [pprint cl-format]]))

(def basic-register-frame 30)
(def bogus-op-register [1])
(def qid-register [1])
(def taxi-register [2])
(def temp-register [3])
(def initial-register 4)

(def object-array-type (class (object-array 1)))

(defn third [x] (nth x 2))


(declare build)

(defn print-registers*
  ([r] (print-registers* r 2 1 #{}))
  ([r max-indent] (print-registers* r max-indent 1 #{}))
  ([r max-indent indent visited]
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
                  (= object-array-type (type x)) (if (< indent max-indent)
                                                   (nest-memo
                                                    (let [nested (print-registers* x max-indent (inc indent) (conj visited x))]
                                                      (apply str (:register nested) (:nests nested))))
                                                   (append-memo "<snip>"))
                  ;;:else (nest-memo (str x)))))
                  :else (append-memo (str x)))))
             {:slot 0 :nests "" :register ""} r)))

(defn print-registers [r & [max-indent]]
  (let [nested (print-registers* r (or max-indent 2))]
    (str (:register nested) (:nests nested))))

(defn no-trace [n m x] x)
(defn console-trace [n m x] (fn [op r] (println "trace" n m) (println op (print-registers r)) (x op r)))

(defn shallow-copy [r] (aclone ^objects r))


(defn rget [r ref]
  (cond (not (vector? ref))
        (if (= ref '*)
          (aclone ^objects r)
          ref)
        ;; special case of constant vector, empty
        (= (count ref) 0) ref
        (= (count ref) 1)
        (aget ^objects r (get ref 0))
        :else
        (rget (aget ^objects r (get ref 0))
              (subvec ref 1))))

(defn rset [r ref v]
  (let [c (count ref)]
    (cond
      (= c 0) ()
      (= c 1) (if (> (ref 0) (count r))
                (do (println "exec error" (ref 0) "is greater than" (count r))
                    (throw c))
                (aset ^objects r (ref 0) v))
      :else
      (rset (aget ^objects r (get ref 0)) (subvec ref 1) v))))


(defn process? [op]
  (or (= op 'insert) (= op 'remove)))

;; simplies - cardinality preserving, no flush

(defn simple [f]
  (fn [d terms build c]
    (fn [op r]
      (when (process? op) (f r terms))
      (c op r))))


(defn donot [d terms build c]
  (let [[_ output-projection inner-projection body] terms
        evaluations (atom {})
        negation-clause (atom ())
        issue (fn [op terms] (doseq [i terms] (c op i)))
                
        get-projected (fn [op r]
                        (when (process? op)
                          (let [k (map #(rget r %1) inner-projection)]
                            (if-let [state (@evaluations k)] state
                                    (let [n [(atom 0) (atom {})]]
                                      (do (swap! evaluations assoc k n)
                                          (@negation-clause r)
                                          (@negation-clause (object-array ['flush nil nil nil nil nil nil]))
                                          n))))))

        ;; txn
        tail (fn [op r]
               (let [[count terms] (get-projected r)]
                 (condp = op
                   'insert (do
                             (swap! count inc)
                             (when (= @count 1) (issue 'remove terms)))
                   'remove (do
                             (swap! count dec)
                             (when (= @count 0) (issue 'insert terms)))
                   nil)))
        
        _ (reset! negation-clause (build body tail))]

    ;; i think* terms in the inner projection can be ignored in the outer projection
    ;; confirm

    (fn [op r]
      (if (process? op)
        (let [[count input-set] (get-projected r)]
          (println "not" count input-set)
          ;; incremental remove from the set as well, bucko..this is a delta-c
          ;; isn't it
          ;; (def k (update-in k ['a 'c] (fnil inc 0)))
          (swap! input-set conj (map #(rget r %1) output-projection))
          (when (= @count 0) (c op r)))
        (c op r)))))


(defn tuple [d terms build c]
  (fn [op r]
    (when (process? op)
      (let [a (rest (rest terms))
            ;; since this is often a file, we currently force this to be at least the base max frame size
            tout (object-array (max (count a) basic-register-frame))]
        (doseq [x (range (count a))]
          (aset ^objects tout x (rget r (nth a x))))
        (rset r (second terms) tout)))
    (c op r)))

(defn variadic-string [f]
  (simple (fn [r terms]
            (rset r (second terms)
                  (apply f (map #(rget r %1) (nth terms 2)))))))

(defn unary-string [f]
  (simple (fn [r terms]
            (rset r (second terms)
                  (f (rget r (nth terms 2)))))))

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
  (fn [op r]
    (let [low  (rget r (nth terms 2))
          high (rget r (nth terms 3))]
      ;; need to copy the file here?
      (doseq [i (range low high)]
        (c (rset r (second terms) i))))))


(defn dofilter [d terms build c]
  (fn [op r]
    (if (process? op)
      (when (rget r (second terms))
        (c op r))
      (c op r))))


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
        update (fn [c op r x]
                 (when (= (swap! x inc) total)
                   (do
                     (reset! x 0)
                     (c op r))))]

    (fn [op r]
      (condp = op
        'flush (update c op r flushes)
        'close  (update c op r closes)
        (c op r)))))


(defn sum [d terms build c]
  (let [totals (atom {})
        prevs (atom {})]
    (fn [op r]
      (let [out-slot (second terms)
            value-slot (nth terms 2)
            grouping-slots (nth terms 3)
            grouping (if (> (count grouping-slots) 0)
                       (map #(rget r %1) grouping-slots)
                       (list 'default))]

        (if (or (= op 'flush) (= op 'close))
          (c op r)
          (do
            (condp = op
              'insert (swap! totals update-in grouping (fnil + 0) (rget r value-slot))
              'remove (swap! totals update-in grouping (fnil - 0) (rget r value-slot))
              ())

            (rset r out-slot (get-in @totals grouping))
            (c op r)

            (when-not (nil? (get-in @prevs grouping nil))
              (rset r out-slot (get-in @prevs grouping)) ;; @FIXME: This needs to copied to be safe asynchronously
              (c 'remove r))
            (swap! prevs assoc-in grouping (get-in @totals grouping))))))))

;; I'm a bad, bad man
(defn make-comparator [sorting]
  (eval `(fn [~'a ~'b]
     ~(reduce (fn [memo [ix dir]]
                (let [[before after] (if (= dir "ascending") ['< '>] ['> '<])]
                  `(if (~before (rget ~'a ~ix) (rget ~'b ~ix))
                     -1
                     (if (~after (rget ~'a ~ix) (rget ~'b ~ix))
                       1
                       ~memo))))
              0
              (reverse sorting)))))

(defn get-sorted-ix [coll sorting value]
  (if (or (nil? coll) (empty? coll))
    0
    (let [compare (make-comparator sorting)]
      (loop [bounds (quot (count coll) 2)
             ix bounds]
        (let [other (nth coll ix)
              delta (compare value other)
              half (quot bounds 2)]
          (if-not (zero? bounds)
            (if (> delta 0)
              (recur half
                     (min (+ ix bounds) (dec (count coll))))
              (if (< delta 0)
                (recur half
                       (max (- ix bounds) 0))
                (inc ix)))
            (if (< (compare value other) 0)
              ix
              (inc ix))))))))

(defn register= [a b]
  (if-not (= (count a) (count b))
    false
    (let [slots (range initial-register (- (count a) initial-register))]
      (every?
       (fn [ix]
         (let [a-slot (rget a [ix])
               b-slot (rget b [ix])]
           (if (= object-array-type (type a-slot))
             (= (seq a-slot) (seq b-slot)) ;; @FIXME: Performance can bite me.
             (= a-slot b-slot))))
       slots))))

(defn index-of-register [coll needle]
  (some #(when (register= needle (nth coll %1))
           %1)
        (range (count coll))))

(defn dosort [d terms build c]
  (let [ordinals (atom {})
        prevs (atom {})]
    (fn [op r]
      (let [out-slot (second terms)
            sorting-slots (nth terms 2)
            grouping-slots (nth terms 3)
            grouping (if-not (zero? (count grouping-slots))
                       (map #(rget r %1) grouping-slots)
                       (list 'default))]
        (if (not (process? op)) (c op r)
          (swap!
           ordinals update-in grouping
           (fn [cur]
             ;; @FIXME: This check probably doesn't work with the overflow buffer
             (let [slots (range initial-register (- (count r) initial-register))
                   existing-ix (index-of-register cur r)]
               (condp = op
                 'insert (if-not existing-ix
                           (let [insert-ix (get-sorted-ix cur sorting-slots r)
                                 [prefix suffix] (split-at insert-ix cur)]
                             (rset r out-slot insert-ix)
                             (c op r)
                             (doseq [ix (range (count suffix))]
                               (let [r (nth suffix ix)]
                                 (c 'remove r)
                                 (rset r out-slot (+ ix insert-ix 1))
                                 (c 'insert r)))
                             (concat prefix [(aclone ^objects r)] suffix))
                           cur)
                 'remove (if existing-ix
                           (let [ix existing-ix
                                 [prefix suffix] (split-at ix cur)
                                 suffix (rest suffix)]
                             (rset r out-slot ix)
                             (c op r)
                             (doseq [ix (range (count suffix))]
                               (let [r (nth suffix ix)]
                                 (c 'remove r)
                                 (rset r out-slot (+ ix existing-ix))
                                 (c 'insert r)))
                             (concat prefix suffix))
                           cur))))))))))

(defn delta-c [d terms build c]
  (let [[_ & proj] terms
        proj (if proj proj [])
        assertions (atom {})]
    (fn [op r]
      (let [fact (when (process? op)
                   (doall (map #(let [v (rget r %1)]
                                  (if (= object-array-type (type v))
                                    nil ;; @FIXME: Is it safe to always ignore tuples for projection equality here?
                                    v))
                               proj)))
            doreduce (defn doreduce [coll fn]
                       (doall (reduce-kv fn {} coll)))
            insert-fact (fn insert-fact [assertion]
                          {:r (aclone ^objects r) :cnt (inc (get assertion :cnt 0)) :prev (:prev assertion)})
            remove-fact (fn remove-fact [assertion]
                          ;; @NOTE: Should this error on remove before insert?
                          {:r (aclone ^objects r) :cnt (dec (get assertion :cnt 0)) :prev (:prev assertion)})]
        (condp = op
          'insert (swap! assertions update-in [fact] insert-fact)
          'remove (swap! assertions update-in [fact] remove-fact)
          'flush (do (swap! assertions doreduce (fn update-each [memo fact assertion]
                                                  (let [r (:r assertion)
                                                        cnt (:cnt assertion)
                                                        prev (or (:prev assertion) 0)]
                                                    (when (and (> prev 0) (zero? cnt))
                                                      (c 'remove r))
                                                    (when (and (zero? prev) (> cnt 0))
                                                      (c 'insert r))
                                                    (assoc memo fact {:r r :cnt cnt :prev cnt}))))
                     (c op r))
          'close (c op r))))))

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

    (fn [op r]
      (if (= op 'insert)
        (let [[e a v b t u] (rget r in)]
          (if (= a edb/remove-oid)
            (let [b (base e)
                  old (if b (walk b) b)]
              (swap! (record down t) conj e)
              (swap! (record up e) conj t)
              (let [nb (if b b (base e))
                    new (if nb (walk nb) nb)]
                (cond (and (not old) new) (do (rset r out (rget r in))
                                              (c op r))
                      (and old (not new)) (do (rset r out (@assertions b))
                                              (c 'remove r)))))

            (do
              (swap! assertions assoc t (rget r in))
              (when (walk t)
                (rset r out (rget r in))
                (c op r)))))
        (c op r)))))

(defn delta-s [d terms build c]
  (let [state (ref {})
        handler (fn [op r]
                  (let [t (rget r (first r))]
                    (condp = op
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
    (fn [op r]
      (c op (rset r (second terms) (handler r))))))


(defn dosend [d terms build c]
  (fn [op r]
    (let [channel (rget r (second terms))
          nregs (rget r (third terms))]
      (channel op (if (not (process? op)) r nregs))
      (c op r))))



(defn doinsert [d terms build c]
  (let [[_ dest tup] terms]
    (fn [op r]
      (condp = op
        'insert (edb/insert d (rget r tup) (rget r qid-register) (fn [t]
                                                                   (rset r dest t)
                                                                   (c op r)))
        'remove (c op r) ;; wait until we have commit frames to remove from
        'close (c op r)
        'flush (do (edb/flush-bag d (rget r qid-register))
                   (c op r))))))

;; this needs to send an error message down the pipe
(defn exec-error [reg comment]
  (throw (ex-info comment {:registers reg :type "exec"})))


(defn doscan [d terms build c]
  (let [[scan dest key] terms
        opened (atom ())
        scan (fn [op r]
               (let [dr (object-array (vec r))
                     ;; handle needs to be moved to the top level
                     handle (edb/full-scan d
                                           (rget r qid-register)
                                           (fn [op t qid]
                                             (rset dr qid-register qid)
                                             (when (= op 'insert)
                                               (rset dr dest t))
                                             (c op dr)))]
                 (swap! opened conj handle)))]


    (fn [op r]
      (condp = op
        'insert (scan op r)
        'remove (scan op r)
        'close (do
                 (doseq [i @opened] (i))
                 (c op r))
        'flush (c op r)))))



(def command-map {'move      (simple move)
                  '+         (ternary-numeric +)
                  '-         (ternary-numeric -)
                  '*         (ternary-numeric *)
                  '/         (ternary-numeric /)
                  '>         (ternary-numeric-boolean >)
                  '<         (ternary-numeric-boolean <)
                  '>=        (ternary-numeric-boolean >=)
                  '<=        (ternary-numeric-boolean <=)
                  'not=      (simple do-not-equal)

                  'hash (unary-string hash)
                  'str (variadic-string str)

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

                  'insert    doinsert
                  'scan      doscan
                  'send      dosend
                  'join      dojoin
                  })


(defn build [name names built d t wrap final]
  (if (= name "out") final
      (let [doterms (fn doterms [t down]
                      (if (empty? t) down
                          (let [ft (first t)
                                m (meta ft)
                                z (if (= (first ft) 'send)
                                    (let [target (second ft)]
                                      (list 'send
                                            (if-let [c (@built target)] c
                                                    (build target names built d (@names target) wrap final))
                                            (third ft)))
                                    ft)
                                k (first z)]
                            (if-let [p (command-map (first z))]
                              (wrap (first t) m (p d z doterms (doterms (rest t) down)))
                              (exec-error [] (str "bad command" k))))))
            trans (doterms t (fn [op r] ()))]
        (swap! built assoc name trans)
        trans)))


;; fuse notrace and trace versions
(defn open [d program callback trace-function]
  (let [reg (object-array basic-register-frame)
        blocks (atom {})
        id (gensym "query")
        built (atom {})
        _ (doseq [i program]
            (swap! blocks assoc (second i) (nth i 2)))
        e (build 'main blocks built d (@blocks 'main) trace-function
                 callback)]

    (fn [op]
      (rset reg qid-register id)
      (e op reg))))


(defn single [d prog out]
  (let [e (open d prog (fn [op r]
                         (when (= op 'insert) (out op r)))
                no-trace)]
    (e 'insert)
    (e 'flush)
    (e 'close)))
