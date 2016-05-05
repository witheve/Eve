(define-ui ci-run-result
  (fact test-run :tag "testrun" :number pr-number :branch :user :title :text description :additions :deletions)
  (fact test-result :tag "testresult" :run test-run :test :result)
  (fact-btu test-result "result" :tick)
  (= test-order (+ 100 (sort tick)))
  (= delta-text (str "(+" additions " / -" deletions ")"))
  (= pr (str "#" pr-number))
  (= url (str "https://github.com/witheve/Eve/pull/" pr-number))
  (= branch-url (str "https://github.com/witheve/eve/tree/" branch))
  (= user-url (str "https://github.com/" user))
  (= test-class (str "test " result))

  (ui [title pr pr-number url user user-url delta-text branch branch-url description]
      (div :id run-tile :parent "root" :ix pr-number :class "test-run")
      (h3 :id header :parent run-tile :ix 1)
        (div :parent header :ix 0 :class "spacer" :text title)
        (a :parent header :ix 1 :text pr :href url)
      (div :id user-tile :parent run-tile :ix 2 :class "run-info")
        (div :parent user-tile :ix 0 :text delta-text)
        (div :parent user-tile :ix 1 :text "in")
        (a :parent user-tile :ix 2 :text branch :href branch-url)
        (div :parent user-tile :ix 3 :text "by")
        (a :parent user-tile :ix 4 :class "user" :text user :href user-url)
      (blockquote :parent run-tile :ix 3 :class "description" :text description))

  (ui [run-tile test test-class test-order]
      (div :id test-tile :parent run-tile :ix test-order :class test-class)
      (div :parent test-tile :ix 0 :text test)))
