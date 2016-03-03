(ns server.serialize)

;; for some reason i thought this was supposed to be in the ns declaration, whatever man
(import '[java.nio ByteBuffer])

;; a nanosecond of unix time (2106 overflow) takes 60 bits...so we can probably
;; multiplex that
;; looks like this is ..big endian(?)
;; tags (64 bits)
;; 

;; immediate formats
;; ------------------
;; 1 small-int  // packed formats
;; 2 nanotime
;; 3 oid
;;
;; collective formats - these numbers dont match the codepoints
;; -----------------
;; 4 vector (length) // unpacked formats
;; 5 utf8-string (length)
;; 6 bigint
;; 7 eavtb

;; units - fix - both their position in the id space and maybe a more generalized
;; form for dictionaries and atoms
;; 16r0fffffffffffffffe
;; 16r0fffffffffffffffd


  
(defn isa-sequence [x]
  (or (= (type x) clojure.lang.PersistentList)
      (= (type x) clojure.lang.PersistentVector)
      (= (type x) clojure.lang.PersistentList$EmptyList)))
      


;; doesn't quite match up with the above
(def true-tag 16r0fffffffffffffffe)
(def false-tag 16r0fffffffffffffffd)
(def int-tag (bit-shift-left 2r0100 60))
(def oid-tag (bit-shift-left 2r1100 60))
(def nanotime-tag (bit-shift-left 2r1000 60))
(def vector-tag (bit-shift-left 2r0001 60))
(def string-tag (bit-shift-left 2r0010 60))
(def bigint-tag (bit-shift-left 2r0011 60))

;; this is gonna eat multiple objects?
(defn decode [callback]
  ;; this machine accepts chunks of bytes (as byte arrays) and
  ;; pukes out completed objects to the callback as they are assembled
  ;; some of these parsers are byte-machines, and some operate on
  ;; larger hunks (except not right now)
  (letfn [(word [complete]
            (let [b (ByteBuffer/allocate 8)
                  self (fn self [y]
                         ;; fuck you java
                         (.put b (byte y))
                         (if (= (.position b) 8)
                           (do
                             (.flip b)
                             (complete (.getLong b)))
                           self))]
              self))
    
          (read-vector [complete len]
            (let [result (atom ())
                  self (fn self []
                         (if (= (count @result) len) (complete @result)
                             (top (fn [x]
                                    ;; this kinda sucks too
                                    (swap! result (fn [head] (concat head (list x))))
                                    (self)))))]
              (self)))

          (read-bytes [complete len]
            (let [result (byte-array len)
                  index (atom 0)
                  self (fn self [b]
                         ;; not really threadsafe, this is all getting pretty silly
                         (aset-byte result @index b)
                         (if (= (swap! index + 1) len)
                           (complete result)
                           self))]
                  
              (if (= len 0)
                (complete result)
                self)))
          
          (top [finish]
            (fn [x]
              (let [ts (bit-shift-right x 6)
                    tr (bit-and x 2r00111111)
                    ls (bit-shift-right x 4)
                    lr (bit-and x 2r00001111)]
                (cond
                  ;; nanotime
                  (= ts 2r10) ((word (fn [x] (finish x) top)) tr)
                  
                  ;; oid
                  (= ts 2r11) ((word (fn [x] (finish x) top)) tr)
                  
                  ;; int
                  (= ts 2r01) ((word finish) lr)
                  
                  ;; vector
                  (= ls 2r0001) ((word (fn [len] (read-vector finish len))) lr)
                  
                  ;; string
                  (= ls 2r0010) ((word (fn [len]
                                         (read-bytes (fn [x] (finish (new String x)))
                                                      len)))
                                 lr)
                  ;; string
                  ;; (println ( new String (.getData orig-packet) "UTF-8"))
                  (= ls 2r0010) top
                  (= x true-tag) true
                  (= x false-tag) false
                  ;; bigint
                  :else
                  (println "deserialization error" ts ls)))))]

    ;; the reduce with the CAS is probably the least effective way of
    ;; shoving bytes into the parsers..but..
    (let [handler (atom (top callback))]
      ;; apparently this is the only way to extract bytes in
      ;; some contexts without making more than one copy...seew
      (fn [bytes offset length]
        (dotimes [i length]
          (swap! handler (fn [h] (h (aget bytes (+ i offset))))))))))


(defn encode [x]
  ;; finish maps a length to buffer
  (let [zorn (fn zorn [offset x finish]
               (let [singleton (fn [x] (let [b (finish (+ offset 8))] (.putLong b offset x) b))]
                 (if (= x nil) (byte-array offset)
                     (let [b (cond
                               (and (= (type x) java.lang.Long)
                                    ;; where does 8 come from
                                    (< x (bit-shift-left 1 60))) (singleton (bit-or x int-tag))
                               
                               (= (type x) java.lang.String) (let [body (.getBytes x)
                                                                   len (count body)
                                                                   b (finish (+ offset len 8))]
                                                               (.putLong b offset (bit-or string-tag len))
                                                               ;; fuckers dont have an overload for this one
                                                               (dotimes [i len]
                                                                 (.put b (+ offset 8 i) (aget body i)))
                                                               b)
                               
                               (= x false) (singleton false-tag)
                               (= x true) (singleton true-tag)
                               
                               (isa-sequence x) (let [each (fn each [z c]
                                                             (if (empty? z) (finish c)
                                                                 (zorn c (first z) (fn [c] (each (rest z) c)))))
                                                      b (each x (+ offset 8))]
                                                  (.putLong b offset (bit-or vector-tag (count x)))
                                                  b)
                               
                               :else
                               (println "serialization typecase error" (type x)))]
                           b))))
        b (zorn 0 x (fn [len]
                      (ByteBuffer/allocate len)))
        ba (byte-array (.limit b))]
    ;; wow, thats fantastic, we do all this work and take all those closure and then...we get to copy it out
    ;; again...thats kind of shite
    (.get b ba)
    ba))


;; s.flush()
;; s.GetFD.Sync()

;(with-open [out (output-stream "/tmp/mystring")]
;  (.write out (prepare-string "hello world")))

