// Compiled by ClojureScript .
goog.provide('aurora.compiler.datalog');
goog.require('cljs.core');
goog.require('clojure.set');
goog.require('clojure.set');

/**
* @constructor
* @param {*} axioms
* @param {*} facts
* @param {*} rules
* @param {*} guards
* @param {*} __meta
* @param {*} __extmap
* @param {*=} __meta 
* @param {*=} __extmap
*/
aurora.compiler.datalog.Knowledge = (function (axioms,facts,rules,guards,__meta,__extmap){
this.axioms = axioms;
this.facts = facts;
this.rules = rules;
this.guards = guards;
this.__meta = __meta;
this.__extmap = __extmap;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2229667594;
if(arguments.length>4){
this.__meta = __meta;
this.__extmap = __extmap;
} else {
this.__meta=null;
this.__extmap=null;
}
})
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IHash$_hash$arity$1 = (function (this__3919__auto__){var self__ = this;
var this__3919__auto____$1 = this;var h__3773__auto__ = self__.__hash;if(!((h__3773__auto__ == null)))
{return h__3773__auto__;
} else
{var h__3773__auto____$1 = cljs.core.hash_imap.call(null,this__3919__auto____$1);self__.__hash = h__3773__auto____$1;
return h__3773__auto____$1;
}
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$ILookup$_lookup$arity$2 = (function (this__3924__auto__,k__3925__auto__){var self__ = this;
var this__3924__auto____$1 = this;return cljs.core._lookup.call(null,this__3924__auto____$1,k__3925__auto__,null);
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$ILookup$_lookup$arity$3 = (function (this__3926__auto__,k10447,else__3927__auto__){var self__ = this;
var this__3926__auto____$1 = this;if(cljs.core.keyword_identical_QMARK_.call(null,k10447,new cljs.core.Keyword(null,"axioms","axioms",3904992629)))
{return self__.axioms;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k10447,new cljs.core.Keyword(null,"facts","facts",1111091961)))
{return self__.facts;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k10447,new cljs.core.Keyword(null,"rules","rules",1122778217)))
{return self__.rules;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k10447,new cljs.core.Keyword(null,"guards","guards",4073761248)))
{return self__.guards;
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return cljs.core.get.call(null,self__.__extmap,k10447,else__3927__auto__);
} else
{return null;
}
}
}
}
}
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IAssociative$_assoc$arity$3 = (function (this__3931__auto__,k__3932__auto__,G__10446){var self__ = this;
var this__3931__auto____$1 = this;var pred__10449 = cljs.core.keyword_identical_QMARK_;var expr__10450 = k__3932__auto__;if(cljs.core.truth_(pred__10449.call(null,new cljs.core.Keyword(null,"axioms","axioms",3904992629),expr__10450)))
{return (new aurora.compiler.datalog.Knowledge(G__10446,self__.facts,self__.rules,self__.guards,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__10449.call(null,new cljs.core.Keyword(null,"facts","facts",1111091961),expr__10450)))
{return (new aurora.compiler.datalog.Knowledge(self__.axioms,G__10446,self__.rules,self__.guards,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__10449.call(null,new cljs.core.Keyword(null,"rules","rules",1122778217),expr__10450)))
{return (new aurora.compiler.datalog.Knowledge(self__.axioms,self__.facts,G__10446,self__.guards,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__10449.call(null,new cljs.core.Keyword(null,"guards","guards",4073761248),expr__10450)))
{return (new aurora.compiler.datalog.Knowledge(self__.axioms,self__.facts,self__.rules,G__10446,self__.__meta,self__.__extmap,null));
} else
{return (new aurora.compiler.datalog.Knowledge(self__.axioms,self__.facts,self__.rules,self__.guards,self__.__meta,cljs.core.assoc.call(null,self__.__extmap,k__3932__auto__,G__10446),null));
}
}
}
}
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this__3938__auto__,writer__3939__auto__,opts__3940__auto__){var self__ = this;
var this__3938__auto____$1 = this;var pr_pair__3941__auto__ = (function (keyval__3942__auto__){return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,cljs.core.pr_writer,""," ","",opts__3940__auto__,keyval__3942__auto__);
});return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,pr_pair__3941__auto__,"#aurora.compiler.datalog.Knowledge{",", ","}",opts__3940__auto__,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"axioms","axioms",3904992629),self__.axioms],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"facts","facts",1111091961),self__.facts],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"rules","rules",1122778217),self__.rules],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"guards","guards",4073761248),self__.guards],null))], null),self__.__extmap));
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this__3929__auto__,entry__3930__auto__){var self__ = this;
var this__3929__auto____$1 = this;if(cljs.core.vector_QMARK_.call(null,entry__3930__auto__))
{return cljs.core._assoc.call(null,this__3929__auto____$1,cljs.core._nth.call(null,entry__3930__auto__,0),cljs.core._nth.call(null,entry__3930__auto__,1));
} else
{return cljs.core.reduce.call(null,cljs.core._conj,this__3929__auto____$1,entry__3930__auto__);
}
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (this__3936__auto__){var self__ = this;
var this__3936__auto____$1 = this;return cljs.core.seq.call(null,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"axioms","axioms",3904992629),self__.axioms],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"facts","facts",1111091961),self__.facts],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"rules","rules",1122778217),self__.rules],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"guards","guards",4073761248),self__.guards],null))], null),self__.__extmap));
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$ICounted$_count$arity$1 = (function (this__3928__auto__){var self__ = this;
var this__3928__auto____$1 = this;return (4 + cljs.core.count.call(null,self__.__extmap));
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (this__3920__auto__,other__3921__auto__){var self__ = this;
var this__3920__auto____$1 = this;if(cljs.core.truth_((function (){var and__3345__auto__ = other__3921__auto__;if(cljs.core.truth_(and__3345__auto__))
{return ((this__3920__auto____$1.constructor === other__3921__auto__.constructor)) && (cljs.core.equiv_map.call(null,this__3920__auto____$1,other__3921__auto__));
} else
{return and__3345__auto__;
}
})()))
{return true;
} else
{return false;
}
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IWithMeta$_with_meta$arity$2 = (function (this__3923__auto__,G__10446){var self__ = this;
var this__3923__auto____$1 = this;return (new aurora.compiler.datalog.Knowledge(self__.axioms,self__.facts,self__.rules,self__.guards,G__10446,self__.__extmap,self__.__hash));
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IMeta$_meta$arity$1 = (function (this__3922__auto__){var self__ = this;
var this__3922__auto____$1 = this;return self__.__meta;
});
aurora.compiler.datalog.Knowledge.prototype.cljs$core$IMap$_dissoc$arity$2 = (function (this__3933__auto__,k__3934__auto__){var self__ = this;
var this__3933__auto____$1 = this;if(cljs.core.contains_QMARK_.call(null,new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"guards","guards",4073761248),null,new cljs.core.Keyword(null,"axioms","axioms",3904992629),null,new cljs.core.Keyword(null,"facts","facts",1111091961),null,new cljs.core.Keyword(null,"rules","rules",1122778217),null], null), null),k__3934__auto__))
{return cljs.core.dissoc.call(null,cljs.core.with_meta.call(null,cljs.core.into.call(null,cljs.core.PersistentArrayMap.EMPTY,this__3933__auto____$1),self__.__meta),k__3934__auto__);
} else
{return (new aurora.compiler.datalog.Knowledge(self__.axioms,self__.facts,self__.rules,self__.guards,self__.__meta,cljs.core.not_empty.call(null,cljs.core.dissoc.call(null,self__.__extmap,k__3934__auto__)),null));
}
});
aurora.compiler.datalog.Knowledge.cljs$lang$type = true;
aurora.compiler.datalog.Knowledge.cljs$lang$ctorPrSeq = (function (this__3958__auto__){return cljs.core._conj.call(null,cljs.core.List.EMPTY,"aurora.compiler.datalog/Knowledge");
});
aurora.compiler.datalog.Knowledge.cljs$lang$ctorPrWriter = (function (this__3958__auto__,writer__3959__auto__){return cljs.core._write.call(null,writer__3959__auto__,"aurora.compiler.datalog/Knowledge");
});
aurora.compiler.datalog.__GT_Knowledge = (function __GT_Knowledge(axioms,facts,rules,guards){return (new aurora.compiler.datalog.Knowledge(axioms,facts,rules,guards));
});
aurora.compiler.datalog.map__GT_Knowledge = (function map__GT_Knowledge(G__10448){return (new aurora.compiler.datalog.Knowledge(new cljs.core.Keyword(null,"axioms","axioms",3904992629).cljs$core$IFn$_invoke$arity$1(G__10448),new cljs.core.Keyword(null,"facts","facts",1111091961).cljs$core$IFn$_invoke$arity$1(G__10448),new cljs.core.Keyword(null,"rules","rules",1122778217).cljs$core$IFn$_invoke$arity$1(G__10448),new cljs.core.Keyword(null,"guards","guards",4073761248).cljs$core$IFn$_invoke$arity$1(G__10448),null,cljs.core.dissoc.call(null,G__10448,new cljs.core.Keyword(null,"axioms","axioms",3904992629),new cljs.core.Keyword(null,"facts","facts",1111091961),new cljs.core.Keyword(null,"rules","rules",1122778217),new cljs.core.Keyword(null,"guards","guards",4073761248))));
});
aurora.compiler.datalog.query = (function query(knowledge,rule){return rule.call(null,new cljs.core.Keyword(null,"facts","facts",1111091961).cljs$core$IFn$_invoke$arity$1(knowledge));
});
aurora.compiler.datalog.fixpoint = (function fixpoint(knowledge){var rules = new cljs.core.Keyword(null,"rules","rules",1122778217).cljs$core$IFn$_invoke$arity$1(knowledge);var facts = new cljs.core.Keyword(null,"facts","facts",1111091961).cljs$core$IFn$_invoke$arity$1(knowledge);while(true){
var new_facts = cljs.core.reduce.call(null,((function (facts){
return (function (facts__$1,rule){return clojure.set.union.call(null,rule.call(null,facts__$1),facts__$1);
});})(facts))
,facts,rules);if(cljs.core.not_EQ_.call(null,facts,new_facts))
{{
var G__10452 = new_facts;
facts = G__10452;
continue;
}
} else
{return cljs.core.assoc.call(null,knowledge,new cljs.core.Keyword(null,"facts","facts",1111091961),new_facts);
}
break;
}
});
aurora.compiler.datalog.knowledge = (function knowledge(facts,rules,guards){return aurora.compiler.datalog.fixpoint.call(null,(new aurora.compiler.datalog.Knowledge(facts,rules,guards)));
});
/**
* @param {...*} var_args
*/
aurora.compiler.datalog.know = (function() { 
var know__delegate = function (knowledge,facts){return aurora.compiler.datalog.fixpoint.call(null,cljs.core.update_in.call(null,cljs.core.update_in.call(null,knowledge,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"axioms","axioms",3904992629)], null),clojure.set.union,facts),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"facts","facts",1111091961)], null),clojure.set.union,facts));
};
var know = function (knowledge,var_args){
var facts = null;if (arguments.length > 1) {
  facts = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return know__delegate.call(this,knowledge,facts);};
know.cljs$lang$maxFixedArity = 1;
know.cljs$lang$applyTo = (function (arglist__10453){
var knowledge = cljs.core.first(arglist__10453);
var facts = cljs.core.rest(arglist__10453);
return know__delegate(knowledge,facts);
});
know.cljs$core$IFn$_invoke$arity$variadic = know__delegate;
return know;
})()
;
/**
* @param {...*} var_args
*/
aurora.compiler.datalog.unknow = (function() { 
var unknow__delegate = function (knowledge,facts){var new_facts = clojure.set.difference.call(null,new cljs.core.Keyword(null,"facts","facts",1111091961).cljs$core$IFn$_invoke$arity$1(knowledge),facts);return aurora.compiler.datalog.fixpoint.call(null,cljs.core.update_in.call(null,cljs.core.assoc_in.call(null,knowledge,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"axioms","axioms",3904992629)], null),new_facts),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"facts","facts",1111091961)], null),new_facts));
};
var unknow = function (knowledge,var_args){
var facts = null;if (arguments.length > 1) {
  facts = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return unknow__delegate.call(this,knowledge,facts);};
unknow.cljs$lang$maxFixedArity = 1;
unknow.cljs$lang$applyTo = (function (arglist__10454){
var knowledge = cljs.core.first(arglist__10454);
var facts = cljs.core.rest(arglist__10454);
return unknow__delegate(knowledge,facts);
});
unknow.cljs$core$IFn$_invoke$arity$variadic = unknow__delegate;
return unknow;
})()
;
