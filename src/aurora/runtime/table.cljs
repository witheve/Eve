(ns aurora.runtime.table
  (:require-macros [aurora.macros :refer [mapv-indexed]]))

(defprotocol ITable
  ;;columns
  (-add-column [this header column])
  (-select-column [this column-id] "Extract a column from a table") ; do we need this for perf reasons?
  (-columns [this] "Return all columns for this table")
  (-column-headers [this] "Return column headers")

  ;;rows
  (-rows [this] "Return all rows for this table")
  (-add-row [this row] "Add a row to a table")
  (-select-row [this row-id] "Extract a row from a table") ; do we need this for perf reasons?

  ;;cells
  (-cell [this row col] "Return the value at row, col")
  (-update-cell [this row col func] "Swap the value of row,col by applying func to it"))


(defn apply-columns [row row-num columns]
  (reduce (fn [final i]
            (if-let [func (get columns i)]
              (assoc final i (func final row-num))
              final))
          row
          (range (count columns))))


(deftype NaiveTable [headers columns rows]
  ITable

  ;;columns
  (-add-column [this header column]
               (if-not column
                 (let [cur-count (count columns)]
                   (NaiveTable. (conj headers header)
                                (conj columns #(get % cur-count))
                                (mapv-indexed (fn [row index]
                                                (conj row nil))
                                              rows)))
                 ;;Then it's a function
                 (NaiveTable. (conj headers header)
                              (conj columns column)
                              (mapv-indexed (fn [row i]
                                              (conj row (column row i)))
                                            rows))))

  (-select-column [this column-id]
                  (NaiveTable. [(get headers column-id)]
                               [(get columns column-id)]
                               (mapv #(get % column-id) rows)))

  (-columns [this]
            columns)

  (-column-headers [this]
                   headers)

  ;;rows
  (-rows [this]
         rows)

  (-add-row [this row]
            (NaiveTable. headers
                         columns
                         (conj rows (apply-columns row (count rows) columns))))

  (-select-row [this row-id]
               (NaiveTable. headers
                            columns
                            [(get rows row-id)])) ; do we need this for perf reasons?

  ;;cells
  (-cell [this row col]
         (get-in rows [row col]))

  (-update-cell [this row col func]
               (NaiveTable. headers
                            columns
                            (assoc rows row
                              (apply-columns (update-in (get rows row) [col] func)
                                             (count rows)
                                             columns))))

  IPrintWithWriter
  (-pr-writer [this writer opts]
              (-write writer (str  (apply str (interpose " | " headers)) "\n" (apply str (interpose "\n" (map pr-str rows))))))
  )


(def identity-column nil)
(def table-headers ["A" "B" "C" "D" "E" "F" "G" "H" "I" "J" "K" "L" "M" "N" "O" "P"])

(defn table
  ([]
   (NaiveTable. [] [] []))
  ([headers]
   (NaiveTable. headers (vec (repeat (count headers) nil)) []))
  ([headers columns]
   (NaiveTable. headers columns []))
  ([headers columns rows]
   (NaiveTable. headers columns rows)))

(defn rows->table [rows]
  (let [column-count (count (first rows))]
    (table (subvec table-headers 0 column-count)
           (vec (repeat column-count nil))
           rows)))

(defn merge-rows [t1 t2]
  (table (-column-headers t1)
         (-columns t1)
         (vec (concat (-rows t1) (-rows t2)))))

(defn add-column
  ([t]
   (-add-columns t (get header (count (-columns t)) nil)))
  ([t header]
   (-add-column t header nil))
  ([t header func]
   (-add-column t header func)))

(defn add-row [t row]
  (-add-row t row))

(defn row [t row-num]
  (-select-row t row-num))

(defn update-cell [t row col func]
  (-update-cell t row col func))

(defn cell [t row col]
  (-cell t row col))

(defn column [t column-num]
  (-column t column-name))

(defn headers [t]
  (-column-headers t))

(defn map-table [func t]
  (let [cols (-columns t)]
    (table (headers t)
           cols
           (mapv-indexed (fn [row index]
                           (apply-columns (func row index)
                                          index
                                          cols))
                         (-rows t)))))

(comment

  (map-table
   (fn [row i]
     (update-in row [0] inc))
   (-> (table)
       (add-column "foo" nil)
       (add-column "bar" (fn [row i]
                           (+ (get row 0) 2)))
       (add-row [3])
       (add-row [7])
       (add-row [9])
       (add-column "woo" (fn [row i]
                           (+ (get row 0) (get row 1))))
       (update-cell 0 0 inc)
       ))

  (-> (table)
      (add-column "foo")
      (add-row [3])
      (add-column "bar" (fn [row i]
                          (+ (get row 0) 3)))
      (add-row [4])
      (row 1)
      (headers)
      )

  (-> (table)
      (add-column "foo" nil)
      (add-column "bar" (fn [row i]
                          (+ (get row 0) 2)))
      (add-row [3])
      (add-row [7])
      (add-row [9])
      (add-column "woo" (fn [row i]
                          (+ (get row 0) (get row 1))))
      (update-cell 0 0 inc)
      ))

(->(rows->table [[1 2] [3 4]])
   (-add-column "woo" (fn [row i]
                        (+ (get row 0) (get row 1))))



   )
