(ns aurora.compiler.code
  (:require [aurora.compiler.datalog :as datalog]
            [aurora.compiler.schema :as schema :refer [errors required exclusive group has-one id! ids! true! text! number! vector! map!]])
  (:require-macros [aurora.macros :refer [check]]
                   [aurora.compiler.datalog :refer [rule q1 q+ q* q?]]))

(def rules
  ;; NOTE this is hand-stratified
  [[(required :notebook :notebook/description :notebook/pages)
    (required :page :page/args :page/steps)
    (required :match :match/arg :match/branches)
    (required :branch :branch/pattern :branch/guards :branch/action)
    (required :call :call/fun :call/args)
    (required :js :js/name)]

   [(exclusive :data :data/nil :data/text :data/number :data/vector :data/map)
    (exclusive :pattern :data :pattern/any :pattern/bind :pattern/vector :pattern/map)]

   [(exclusive :step? :data :call :match)]

   [(rule [?notebook :notebook/pages ?pages] (:in ?page ?pages) :return [page :page/notebook notebook])]

   [(rule [?page :page/args ?args] (:in ?arg ?args) :return [arg :arg page])
    (rule [?page :page/steps ?steps] (:in ?step ?steps) :return [step :step page])]

   [(group :ref :step :arg :js :page :pattern)] ;; TODO check scoping (same page, def before ref, pattern only in branch)

   [(has-one :page/args (ids! :arg))
    (has-one :page/steps (ids! :step?))
    (has-one :match/arg (id! :ref))
    (has-one :match/branches (ids! :branch))
    (has-one :branch/pattern (id! :pattern))
    (has-one :branch/guards (ids! :call))
    (has-one :branch/action (id! :call))
    (has-one :data/nil true!)
    (has-one :data/text text!)
    (has-one :data/number number!)
    (has-one :data/vector (vector! (id! :ref)))
    (has-one :data/map (map! (id! :ref) (id! :ref)))
    (has-one :pattern/any true!)
    (has-one :pattern/vector (vector! (id! :pattern)))
    (has-one :pattern/map (map! (id! :data) (id! :pattern)))
    (has-one :call/fun (id! :ref))
    (has-one :call/args (ids! :ref))
    (has-one :js/name text!)]])

;; examples

(def stdlib
  #{[:fun_mult :js/name "cljs.core._STAR_"]
    [:fun_sub :js/name "cljs.core._"]
    [:fun_number :js/name "cljs.core.number_QMARK_"]
    [:replace :js/name "null"] ;; temporary hack
    })

(def example-a
  #{[:root_notebook :notebook/description "wooohoo"]
    [:root_notebook :notebook/pages [:root]]
    [:root :page/args [:arg_a :arg_b :arg_c]]
    [:root :page/steps [:b_squared :four :four_a_c :result]]
    [:b_squared :call/fun :fun_mult]
    [:b_squared :call/args [:arg_b :arg_b]]
    [:four :data/number 4]
    [:four_a_c :call/fun :fun_mult]
    [:four_a_c :call/args [:four :arg_a :arg_c]]
    [:result :call/fun :fun_sub]
    [:result :call/args [:b_squared :four_a_c]]})

(errors (datalog/knowledge (clojure.set/union stdlib example-a) rules))

(q* (datalog/knowledge (clojure.set/union stdlib example-a) rules) [?id :page true] :return id)

(def example-b
  #{[:root_notebook :notebook/description "wooohoo"]
    [:root_notebook :notebook/pages [:root :vec]]
    [:root :page/args [:arg_x]]
    [:root :page/steps [:result]]
    [:result :match/arg :arg_x]
    [:result :match/branches [:branch_map :branch_nested]]
    [:branch_map :branch/pattern :pattern_map]
    [:branch_map :branch/guards [:number_a :number_b]]
    [:branch_map :branch/action :action_map]
    [:pattern_map :pattern/map {:text_a :bind_a :text_b :bind_b}]
    [:text_a :data/text "a"]
    [:text_b :data/text "b"]
    [:bind_a :pattern/any true]
    [:bind_b :pattern/any true]
    [:number_a :call/fun :fun_number]
    [:number_a :call/args [:bind_a]]
    [:number_b :call/fun :fun_number]
    [:number_b :call/args [:bind_b]]
    [:action_map :call/fun :fun_sub]
    [:action_map :call/args [:bind_a :bind_b]]
    [:branch_nested :branch/pattern :pattern_nested]
    [:branch_nested :branch/guards []]
    [:branch_nested :branch/action :action_nested]
    [:pattern_nested :pattern/map {:text_vec :bind_y}]
    [:text_vec :data/text "vec"]
    [:bind_y :pattern/any true]
    [:action_nested :call/fun :vec]
    [:action_nested :call/args [:bind_y]]
    [:vec :page/args [:arg_y]]
    [:vec :page/steps [:vec_result]]
    [:vec_result :match/arg :arg_x]
    [:vec_result :match/branches [:branch_only]]
    [:branch_only :branch/pattern :pattern_only]
    [:branch_only :branch/guards []]
    [:branch_only :branch/action :action_only]
    [:pattern_only :pattern/vector [:bind_z :text_foo]]
    [:bind_z :pattern/any true]
    [:text_foo :data/text "foo"]
    [:action_only :call/fun :replace]
    [:action_only :call/args [:bind_z :text_more]]
    [:text_more :data/text "more foo!"]})

(errors (datalog/knowledge (clojure.set/union stdlib example-b) rules))

(q* (datalog/knowledge (clojure.set/union stdlib example-b) rules) [:vec :notebook/page ?id] :return id)
