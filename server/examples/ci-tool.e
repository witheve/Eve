(define-ui ci-run-result
  (fact test-run :tag "testrun" :number pr-number :branch :user :title :description :additions :deletions)
  (fact test-result :tag "testresult" :test :result)
  (fact-btu test-result "result" :tick)
  (= delta-text (str "(+" additions " / -" deletions ")"))
  (= pr (str "#" pr-number))
  (= url (str "https://github.com/witheve/Eve/pull/" pr-number))

  (ui [title pr url user delta-text description]
      (div :id run-tile :parent "root" :class "test-run")
      (h3 :id header :parent run-tile :ix 0)
        (span :parent header :ix 0 :text title)
        (span :parent header :ix 1 :class "spacer")
        (a :parent header :ix 2 :href url :text pr)
      (div :id user-tile :parent run-tile :ix 1)
        (span :parent user-tile :ix 0 :text user)
        (span :parent user-tile :ix 1 :text delta-text)
      (div :parent run-tile :ix 2 :text description))

  (ui [run-tile test result tick]
      (div :id test-tile :parent run-tile :ix tick :class "test")
      (span :parent test-tile :ix 0 :text test)
      (span :parent test-tile :ix 1 :text result)))


(query
 (insert-fact! "run916"
               :tag "testrun"
               :user "convolvatron"
               :number 360
               :sha "40768185b8c8776ba216e1489a583387ae55b284"
               :branch "fix/thing"
               :title "Fixed the thing!"
               :description "One of the widgets needed recombobulated. It's alright now."
               :additions "17"
               :deletions "3")
 (insert-fact! "test917" :result true :run "run916" :tag "testresult" :test "test-2")
 (insert-fact! "test922" :result true :run "run916" :tag "testresult" :test "test-1"))
