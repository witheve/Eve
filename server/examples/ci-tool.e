(define-ui ci-run-result
  (fact test-run :tag "testrun" :number pr-number :branch :user :title :description :additions :deletions)
  (fact test-result :tag "testresult" :run test-run :test :result)
  (fact-btu test-result "result" :tick)
  (= delta-text (str "(+" additions " / -" deletions ")"))
  (= pr (str "#" pr-number))
  (= url (str "https://github.com/witheve/Eve/pull/" pr-number))
  (= branch-url (str "https://github.com/witheve/eve/tree/" branch))
  (= user-url (str "https://github.com/" user))
  (= test-class (str "test " result))

  (ui [title pr url user user-url delta-text branch branch-url description]
      (div :id run-tile :parent "root" :class "test-run")
      (h3 :id header :parent run-tile :ix 1)
        (div :parent header :ix 0 :class "spacer" :text title)
        (a :parent header :ix 2 :text pr :href url)
      (div :id user-tile :parent run-tile :ix 2 :class "run-info")
        (div :parent user-tile :ix 0 :text delta-text)
        (div :parent user-tile :ix 1 :text "in")
        (a :parent user-tile :ix 2 :text branch :href branch-url)
        (div :parent user-tile :ix 3 :text "by")
        (a :parent user-tile :ix 4 :class "user" :text user :href user-url)
      (blockquote :parent run-tile :ix 3 :class "description" :text description))

  (ui [run-tile test test-class tick]
      (div :id test-tile :parent run-tile :ix tick :class test-class)
      (div :parent test-tile :ix 0 :text test)))

(query
 (insert-fact! "run916"
               :tag "testrun"
               :user "convolvatron"
               :number 359
               :sha "fe156b55583c417364651c750d03992b6e0953f4"
               :branch "master"
               :title "change edb flush to be per-scan, not per-item"
               :description "this is probably a good idea"
               :additions "45"
               :deletions "42")
 (insert-fact! "test917" :result true :run "run916" :tag "testresult" :test "harness-sanity-check")
 (insert-fact! "test922" :result true :run "run916" :tag "testresult" :test "join")
 (insert-fact! "test923" :result true :run "run916" :tag "testresult" :test "union")
 (insert-fact! "test924" :result true :run "run916" :tag "testresult" :test "choose")
 (insert-fact! "test925" :result true :run "run916" :tag "testresult" :test "sum")
 (insert-fact! "test926" :result true :run "run916" :tag "testresult" :test "sort"))
