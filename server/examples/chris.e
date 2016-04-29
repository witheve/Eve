(open foo (query [e a v]
                 (fact-btu e a v)))
           
(query 
     (insert-fact! "a" :x-offset 0)
     (insert-fact! "a" :y-offset 0)
     (insert-fact! "a" :extending-selection false)
     (insert-fact! "b" :x 1)
     (insert-fact! "b" :y 2)
     (insert-fact! "b" :width 1)
     (insert-fact! "b" :height 1)
     (insert-fact! "b" :grid-id "main")
     (insert-fact! "b" :tag "selection")
     (query 
        (fact-btu "a" "x-offset" 0 :tick tick745)
        (remove-by-t! tick745))
     (query 
       (fact-btu "a" "y-offset" 0 :tick tick746)
       (remove-by-t! tick746))
     (query 
       (fact-btu "a" "extending-selection" false :tick tick747)
       (remove-by-t! tick747))
     (query 
       (fact-btu "eae1b9cd-ff76-4ac7-8d11-1299cbc970c8" "tag" "selection" :tick tick748)
       (remove-by-t! tick748)
       (fact-btu "c" "grid-id" "main" :tick tick749)
       (remove-by-t! tick749)
       (fact-btu "c" "x" 1 :tick tick750)
       (remove-by-t! tick750)
       (fact-btu "c" "y" 1 :tick tick751)
       (remove-by-t! tick751)
       (fact-btu "c" "width" 1 :tick tick752)
       (remove-by-t! tick752)
       (fact-btu "c" "height" 1 :tick tick753)
       (remove-by-t! tick753)))
