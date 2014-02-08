// Compiled by ClojureScript .
goog.provide('aurora.compiler.match');
goog.require('cljs.core');

/**
* @constructor
* @param {*} __meta
* @param {*} __extmap
* @param {*=} __meta 
* @param {*=} __extmap
*/
aurora.compiler.match.MatchFailure = (function (__meta,__extmap){
this.__meta = __meta;
this.__extmap = __extmap;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2229667594;
if(arguments.length>0){
this.__meta = __meta;
this.__extmap = __extmap;
} else {
this.__meta=null;
this.__extmap=null;
}
})
aurora.compiler.match.MatchFailure.prototype.cljs$core$IHash$_hash$arity$1 = (function (this__3919__auto__){var self__ = this;
var this__3919__auto____$1 = this;var h__3773__auto__ = self__.__hash;if(!((h__3773__auto__ == null)))
{return h__3773__auto__;
} else
{var h__3773__auto____$1 = cljs.core.hash_imap.call(null,this__3919__auto____$1);self__.__hash = h__3773__auto____$1;
return h__3773__auto____$1;
}
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$ILookup$_lookup$arity$2 = (function (this__3924__auto__,k__3925__auto__){var self__ = this;
var this__3924__auto____$1 = this;return cljs.core._lookup.call(null,this__3924__auto____$1,k__3925__auto__,null);
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$ILookup$_lookup$arity$3 = (function (this__3926__auto__,k10477,else__3927__auto__){var self__ = this;
var this__3926__auto____$1 = this;if(new cljs.core.Keyword(null,"else","else",1017020587))
{return cljs.core.get.call(null,self__.__extmap,k10477,else__3927__auto__);
} else
{return null;
}
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$IAssociative$_assoc$arity$3 = (function (this__3931__auto__,k__3932__auto__,G__10476){var self__ = this;
var this__3931__auto____$1 = this;var pred__10479 = cljs.core.keyword_identical_QMARK_;var expr__10480 = k__3932__auto__;return (new aurora.compiler.match.MatchFailure(self__.__meta,cljs.core.assoc.call(null,self__.__extmap,k__3932__auto__,G__10476),null));
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this__3938__auto__,writer__3939__auto__,opts__3940__auto__){var self__ = this;
var this__3938__auto____$1 = this;var pr_pair__3941__auto__ = (function (keyval__3942__auto__){return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,cljs.core.pr_writer,""," ","",opts__3940__auto__,keyval__3942__auto__);
});return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,pr_pair__3941__auto__,"#aurora.compiler.match.MatchFailure{",", ","}",opts__3940__auto__,cljs.core.concat.call(null,cljs.core.PersistentVector.EMPTY,self__.__extmap));
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this__3929__auto__,entry__3930__auto__){var self__ = this;
var this__3929__auto____$1 = this;if(cljs.core.vector_QMARK_.call(null,entry__3930__auto__))
{return cljs.core._assoc.call(null,this__3929__auto____$1,cljs.core._nth.call(null,entry__3930__auto__,0),cljs.core._nth.call(null,entry__3930__auto__,1));
} else
{return cljs.core.reduce.call(null,cljs.core._conj,this__3929__auto____$1,entry__3930__auto__);
}
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (this__3936__auto__){var self__ = this;
var this__3936__auto____$1 = this;return cljs.core.seq.call(null,cljs.core.concat.call(null,cljs.core.PersistentVector.EMPTY,self__.__extmap));
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$ICounted$_count$arity$1 = (function (this__3928__auto__){var self__ = this;
var this__3928__auto____$1 = this;return (0 + cljs.core.count.call(null,self__.__extmap));
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (this__3920__auto__,other__3921__auto__){var self__ = this;
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
aurora.compiler.match.MatchFailure.prototype.cljs$core$IWithMeta$_with_meta$arity$2 = (function (this__3923__auto__,G__10476){var self__ = this;
var this__3923__auto____$1 = this;return (new aurora.compiler.match.MatchFailure(G__10476,self__.__extmap,self__.__hash));
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$IMeta$_meta$arity$1 = (function (this__3922__auto__){var self__ = this;
var this__3922__auto____$1 = this;return self__.__meta;
});
aurora.compiler.match.MatchFailure.prototype.cljs$core$IMap$_dissoc$arity$2 = (function (this__3933__auto__,k__3934__auto__){var self__ = this;
var this__3933__auto____$1 = this;if(cljs.core.contains_QMARK_.call(null,cljs.core.PersistentHashSet.EMPTY,k__3934__auto__))
{return cljs.core.dissoc.call(null,cljs.core.with_meta.call(null,cljs.core.into.call(null,cljs.core.PersistentArrayMap.EMPTY,this__3933__auto____$1),self__.__meta),k__3934__auto__);
} else
{return (new aurora.compiler.match.MatchFailure(self__.__meta,cljs.core.not_empty.call(null,cljs.core.dissoc.call(null,self__.__extmap,k__3934__auto__)),null));
}
});
aurora.compiler.match.MatchFailure.cljs$lang$type = true;
aurora.compiler.match.MatchFailure.cljs$lang$ctorPrSeq = (function (this__3958__auto__){return cljs.core._conj.call(null,cljs.core.List.EMPTY,"aurora.compiler.match/MatchFailure");
});
aurora.compiler.match.MatchFailure.cljs$lang$ctorPrWriter = (function (this__3958__auto__,writer__3959__auto__){return cljs.core._write.call(null,writer__3959__auto__,"aurora.compiler.match/MatchFailure");
});
aurora.compiler.match.__GT_MatchFailure = (function __GT_MatchFailure(){return (new aurora.compiler.match.MatchFailure());
});
aurora.compiler.match.map__GT_MatchFailure = (function map__GT_MatchFailure(G__10478){return (new aurora.compiler.match.MatchFailure(null,cljs.core.dissoc.call(null,G__10478)));
});
