(ns server.serialize
  (:require [server.db :as db])
  (:require [clojure.pprint :refer [pprint]]))

(import java.lang.System)
(import java.util.Arrays)

(defmacro singletonian [] (let [k (gensym 'singleton)] `(do (defrecord ~k [~'a]) ~(symbol (str "->" k)))))

;; these are funky singletons
(def version1 (singletonian))
(def five-tuple (singletonian))
(def negative-infinity (singletonian))
(def positive-infinity (singletonian))

(declare object-length)
(declare encode-object)
(declare decode-object)

(defn string-length [x] (+ 1 (count (.getBytes x))))
;; xxx - only 64k string
(defn encode-string [dest offset x]
  (let [b (.getBytes x)
        len (count b)]
  (aset ^bytes dest offset (unchecked-byte (bit-or 2r10010000 len)))
  (System/arraycopy b 0 dest (+ offset 1) len)
  (+ offset len 1)))

  
(defn decode-string [source offset length]
  ;; could pass this read along
  (let [slen (bit-and (aget source offset) 0x0000000f)
        target (+ slen offset 1)]
    (if (> target length) [nil target]
        [(new String (java.util.Arrays/copyOfRange source (+ offset 1) target))
         target])))


(defn symbol-length [x] (string-length (name x)))
(defn encode-symbol [dest offset x] (encode-string dest offset (name x)))

(defn vector-length [x]
  (+ 1 (reduce + (map object-length x))))

(defn encode-vector [dest offset x]
  (let [len (count x)]
    (aset dest offset (unchecked-byte (bit-or 2r10100000 len)))
    (reduce (fn [o x] (encode-object dest o x)) (+ offset 1) x)))

(defn decode-vector [source offset length]
  (let [len (bit-and (aget source offset) 0x0000000f)]
    (reduce
     (fn [[in o] slot]
       (if in (let [[k o] (decode-object source o length)]
               (if (not k) [k o] [(conj in k) o]))
           [in o]))
     [[] (+ offset 1)] (range len))))




(defn write-long [dest offset x]
  (aset dest (+ offset 0) (unchecked-byte (bit-shift-right x 56)))
  (aset dest (+ offset 1) (unchecked-byte (bit-shift-right x 48)))
  (aset dest (+ offset 2) (unchecked-byte (bit-shift-right x 40)))
  (aset dest (+ offset 3) (unchecked-byte (bit-shift-right x 32)))
  (aset dest (+ offset 4) (unchecked-byte (bit-shift-right x 24)))
  (aset dest (+ offset 5) (unchecked-byte (bit-shift-right x 16)))
  (aset dest (+ offset 6) (unchecked-byte (bit-shift-right x 8)))
  (aset dest (+ offset 8) (unchecked-byte x))
  (+ offset 8))

;; enforce range sizes
(defn encode-long [dest offset x]
  (aset dest offset (unchecked-byte 2r11100000))
  ;; recommended pattern
  ;; is to wrap it in one of several kinds of byte buffers and extract it
  ;; how can this be so obscene...there is a suggestion about Unsafe.writeLong...
  (aset dest (+ offset 1) (byte 0))
  (aset dest (+ offset 2) (byte 0))
  (aset dest (+ offset 3) (byte 0))
  (write-long dest (+ offset 4) x))

;; ok, bigdec right now is 6 bits of scale and 11 bytes of unscaled...not sure if
;; serious?
(defn encode-bigdec [dest offset x]
  (let [base (.toByteArray (.unscaledValue x))
        target (+ offset 1)
        source (min (count base) 11)]
    ;(System/arraycopy dest (+ offset 1) base (min (count base) 11))
    (aset dest offset (bit-or 2r10000000) (.scale x))
    (+ offset 12)))

(defn decode-bigdec [source offset length]
  (let [final (+ 12 offset)]
    (if (> final length) [nil final]
        (let [scale (bit-and (aget source offset) 2r00011111)
              b (new java.math.BigInteger (java.util.Arrays/copyOfRange source
                                                                        (+ offset 1)
                                                                        (+ offset 11)))]
          [(new java.math.BigDecimal b) final]))))


(defn encode-boolean [dest offset x]
  (aset dest offset (unchecked-byte (if x 2r11111001 2r11111000)))
  (+ offset 1))

(defn write-short [dest offset x]
  (aset dest offset (unchecked-byte (bit-shift-right x 8)))
  (aset dest (+ offset 1) (unchecked-byte x))
  (+ offset 2))

  
(defn encode-uuid [dest offset x]
  (let [t (.time x)
        b (.batch x)
        m (.machine x)]
    ;; make sure top bit is zero
    (write-short dest (write-short dest (write-long dest offset t) b) m)))


(defn decode-uuid [source offset length]
  (let [t 0
        batch 0
        machine 0]
  [(db/wrapoid t batch machine) (+ offset 12)]))


(defn decode-five-tuple [source offset length]
  (let [result (object-array 5)]
    (reduce
     (fn [[r o] slot]
       (if r (let [[k o] (decode-object source o length)]
               (aset result slot k)
               [k o])
           r))
     [true (+ offset 1)] (range 5))))

;; fix this constant diffusion
(def encodes
  {
   java.lang.String               [string-length encode-string]
   clojure.lang.Symbol            [symbol-length encode-symbol]
   clojure.lang.Keyword           [symbol-length encode-symbol] ;; name strips off the colon
   clojure.lang.LazySeq           [vector-length encode-vector]
   clojure.lang.PersistentVector$ChunkedSeq [vector-length encode-vector] ;; wth
   clojure.lang.PersistentVector  [vector-length encode-vector]
   java.lang.Boolean              [1 encode-boolean]
   server.db.uuid                 [12 encode-uuid]
   ;   server.db.station          [8 encode-station]
   java.lang.Long                 [12 encode-long]
   java.math.BigDecimal           [12 encode-bigdec]
   })


;; need to glue together the use of these constants with the encode path for consistencirifficty
;; if we can burn two bits at the top we get alot more codepoint space
(def decodes
  [["0xxxxxxx"  decode-uuid]
   ["111xxxxx"  decode-bigdec]
   ["1010xxxx"  decode-vector]
   ["1001xxxx"  decode-string]
   ["10001010"  decode-five-tuple]
   ["10001011"  version1]
   ["10001001"  true]
   ["10001000"  false]])



(defn bit-seq [x]
  (map #(if (bit-test x %1) 1 0) (range 7 -1 -1)))

(def decode-object
  (let [insert (fn insert [where k v]
               (if (or (empty? k) (= (first k) \x))
                 (if (fn? v) (list v 'buffer 'o 'len) v)
                 (condp = (first k)
                   \0 [(insert (if-let [r (where 0)] r [nil nil]) (rest k) v)
                       (where 1)]
                   \1 [(where 0)
                       (insert (if-let [r (where 1)] r [nil nil]) (rest k) v)])))
      tree (reduce (fn [b i] (insert b (i 0) (i 1))) [nil nil] decodes)
      emit (fn emit [x level]
             (condp = (type x)
               clojure.lang.PersistentVector `(if (bit-test ~'b ~level) ~(emit (x 1) (- level 1)) ~(emit (x 0) (- level 1)))
               x))]
    (eval (list 'fn '[buffer o len]
                (list 'if '(= o len) [nil 0]
                      (list 'let '[b (aget buffer o)]
                            (emit tree 7)))))))


;; really for the log case, keeps running until we're out of objects in the buffer
(defn decode-five-tuples [bytes offset length handler]
    (loop [o offset]
      (let [[r b] (decode-object bytes o length)]
        (when (not (nil? r))
          (handler r)
          (recur b)))))

(defn object-length [x]
  (let [e (encodes (type x))]
    (cond
      (not e) (throw (IllegalArgumentException. (str "unknown type in serialize encoder" (type x))))
      ;; assholes
      (= (type (e 0)) java.lang.Long) (e 0)
      :else
      ((e 0) x))))


(defn encode-object [b offset x]
  (let [e (encodes (type x))
        r ((e 1) b offset x)]
    ;; this returns the length, its probably more straightforward if it returns
    ;; the offset after the operation
    r))
    
  
(defn encode-five-tuples [tuples]
  (let [len (reduce + (map #(+ 1 (reduce + (map object-length %1))) tuples))
        b (byte-array len)
        encode-tuple (fn [offset x]
                       ;; xxx - consistency with the decode map above
                       (aset b offset (unchecked-byte 2r10001010))
                       (reduce (fn [o x] (encode-object b o x)) (+ offset 1) x))]
    (reduce (fn [o x] (encode-tuple o x)) 0 tuples)
    b))


;; s.flush()
;; s.GetFD.Sync()

;(with-open [out (output-stream "/tmp/mystring")]
;  (.write out (prepare-string "hello world")))

