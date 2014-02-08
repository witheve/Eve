// Compiled by ClojureScript .
goog.provide('aurora.util.core');
goog.require('cljs.core');
cljs.core.enable_console_print_BANG_.call(null);

/**
* @constructor
* @param {*} message
* @param {*} line
* @param {*} file
* @param {*} trace
* @param {*} __meta
* @param {*} __extmap
* @param {*=} __meta 
* @param {*=} __extmap
*/
aurora.util.core.FailedCheck = (function (message,line,file,trace,__meta,__extmap){
this.message = message;
this.line = line;
this.file = file;
this.trace = trace;
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
aurora.util.core.FailedCheck.prototype.cljs$core$IHash$_hash$arity$1 = (function (this__3919__auto__){var self__ = this;
var this__3919__auto____$1 = this;var h__3773__auto__ = self__.__hash;if(!((h__3773__auto__ == null)))
{return h__3773__auto__;
} else
{var h__3773__auto____$1 = cljs.core.hash_imap.call(null,this__3919__auto____$1);self__.__hash = h__3773__auto____$1;
return h__3773__auto____$1;
}
});
aurora.util.core.FailedCheck.prototype.cljs$core$ILookup$_lookup$arity$2 = (function (this__3924__auto__,k__3925__auto__){var self__ = this;
var this__3924__auto____$1 = this;return cljs.core._lookup.call(null,this__3924__auto____$1,k__3925__auto__,null);
});
aurora.util.core.FailedCheck.prototype.cljs$core$ILookup$_lookup$arity$3 = (function (this__3926__auto__,k13357,else__3927__auto__){var self__ = this;
var this__3926__auto____$1 = this;if(cljs.core.keyword_identical_QMARK_.call(null,k13357,new cljs.core.Keyword(null,"message","message",1968829305)))
{return self__.message;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k13357,new cljs.core.Keyword(null,"line","line",1017226086)))
{return self__.line;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k13357,new cljs.core.Keyword(null,"file","file",1017047278)))
{return self__.file;
} else
{if(cljs.core.keyword_identical_QMARK_.call(null,k13357,new cljs.core.Keyword(null,"trace","trace",1124525239)))
{return self__.trace;
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return cljs.core.get.call(null,self__.__extmap,k13357,else__3927__auto__);
} else
{return null;
}
}
}
}
}
});
aurora.util.core.FailedCheck.prototype.cljs$core$IAssociative$_assoc$arity$3 = (function (this__3931__auto__,k__3932__auto__,G__13356){var self__ = this;
var this__3931__auto____$1 = this;var pred__13359 = cljs.core.keyword_identical_QMARK_;var expr__13360 = k__3932__auto__;if(cljs.core.truth_(pred__13359.call(null,new cljs.core.Keyword(null,"message","message",1968829305),expr__13360)))
{return (new aurora.util.core.FailedCheck(G__13356,self__.line,self__.file,self__.trace,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__13359.call(null,new cljs.core.Keyword(null,"line","line",1017226086),expr__13360)))
{return (new aurora.util.core.FailedCheck(self__.message,G__13356,self__.file,self__.trace,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__13359.call(null,new cljs.core.Keyword(null,"file","file",1017047278),expr__13360)))
{return (new aurora.util.core.FailedCheck(self__.message,self__.line,G__13356,self__.trace,self__.__meta,self__.__extmap,null));
} else
{if(cljs.core.truth_(pred__13359.call(null,new cljs.core.Keyword(null,"trace","trace",1124525239),expr__13360)))
{return (new aurora.util.core.FailedCheck(self__.message,self__.line,self__.file,G__13356,self__.__meta,self__.__extmap,null));
} else
{return (new aurora.util.core.FailedCheck(self__.message,self__.line,self__.file,self__.trace,self__.__meta,cljs.core.assoc.call(null,self__.__extmap,k__3932__auto__,G__13356),null));
}
}
}
}
});
aurora.util.core.FailedCheck.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this__3938__auto__,writer__3939__auto__,opts__3940__auto__){var self__ = this;
var this__3938__auto____$1 = this;var pr_pair__3941__auto__ = (function (keyval__3942__auto__){return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,cljs.core.pr_writer,""," ","",opts__3940__auto__,keyval__3942__auto__);
});return cljs.core.pr_sequential_writer.call(null,writer__3939__auto__,pr_pair__3941__auto__,"#aurora.util.core.FailedCheck{",", ","}",opts__3940__auto__,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"message","message",1968829305),self__.message],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"line","line",1017226086),self__.line],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"file","file",1017047278),self__.file],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"trace","trace",1124525239),self__.trace],null))], null),self__.__extmap));
});
aurora.util.core.FailedCheck.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this__3929__auto__,entry__3930__auto__){var self__ = this;
var this__3929__auto____$1 = this;if(cljs.core.vector_QMARK_.call(null,entry__3930__auto__))
{return cljs.core._assoc.call(null,this__3929__auto____$1,cljs.core._nth.call(null,entry__3930__auto__,0),cljs.core._nth.call(null,entry__3930__auto__,1));
} else
{return cljs.core.reduce.call(null,cljs.core._conj,this__3929__auto____$1,entry__3930__auto__);
}
});
aurora.util.core.FailedCheck.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (this__3936__auto__){var self__ = this;
var this__3936__auto____$1 = this;return cljs.core.seq.call(null,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"message","message",1968829305),self__.message],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"line","line",1017226086),self__.line],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"file","file",1017047278),self__.file],null)),(new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,[new cljs.core.Keyword(null,"trace","trace",1124525239),self__.trace],null))], null),self__.__extmap));
});
aurora.util.core.FailedCheck.prototype.cljs$core$ICounted$_count$arity$1 = (function (this__3928__auto__){var self__ = this;
var this__3928__auto____$1 = this;return (4 + cljs.core.count.call(null,self__.__extmap));
});
aurora.util.core.FailedCheck.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (this__3920__auto__,other__3921__auto__){var self__ = this;
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
aurora.util.core.FailedCheck.prototype.cljs$core$IWithMeta$_with_meta$arity$2 = (function (this__3923__auto__,G__13356){var self__ = this;
var this__3923__auto____$1 = this;return (new aurora.util.core.FailedCheck(self__.message,self__.line,self__.file,self__.trace,G__13356,self__.__extmap,self__.__hash));
});
aurora.util.core.FailedCheck.prototype.cljs$core$IMeta$_meta$arity$1 = (function (this__3922__auto__){var self__ = this;
var this__3922__auto____$1 = this;return self__.__meta;
});
aurora.util.core.FailedCheck.prototype.cljs$core$IMap$_dissoc$arity$2 = (function (this__3933__auto__,k__3934__auto__){var self__ = this;
var this__3933__auto____$1 = this;if(cljs.core.contains_QMARK_.call(null,new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"trace","trace",1124525239),null,new cljs.core.Keyword(null,"message","message",1968829305),null,new cljs.core.Keyword(null,"line","line",1017226086),null,new cljs.core.Keyword(null,"file","file",1017047278),null], null), null),k__3934__auto__))
{return cljs.core.dissoc.call(null,cljs.core.with_meta.call(null,cljs.core.into.call(null,cljs.core.PersistentArrayMap.EMPTY,this__3933__auto____$1),self__.__meta),k__3934__auto__);
} else
{return (new aurora.util.core.FailedCheck(self__.message,self__.line,self__.file,self__.trace,self__.__meta,cljs.core.not_empty.call(null,cljs.core.dissoc.call(null,self__.__extmap,k__3934__auto__)),null));
}
});
aurora.util.core.FailedCheck.cljs$lang$type = true;
aurora.util.core.FailedCheck.cljs$lang$ctorPrSeq = (function (this__3958__auto__){return cljs.core._conj.call(null,cljs.core.List.EMPTY,"aurora.util.core/FailedCheck");
});
aurora.util.core.FailedCheck.cljs$lang$ctorPrWriter = (function (this__3958__auto__,writer__3959__auto__){return cljs.core._write.call(null,writer__3959__auto__,"aurora.util.core/FailedCheck");
});
aurora.util.core.__GT_FailedCheck = (function __GT_FailedCheck(message,line,file,trace){return (new aurora.util.core.FailedCheck(message,line,file,trace));
});
aurora.util.core.map__GT_FailedCheck = (function map__GT_FailedCheck(G__13358){return (new aurora.util.core.FailedCheck(new cljs.core.Keyword(null,"message","message",1968829305).cljs$core$IFn$_invoke$arity$1(G__13358),new cljs.core.Keyword(null,"line","line",1017226086).cljs$core$IFn$_invoke$arity$1(G__13358),new cljs.core.Keyword(null,"file","file",1017047278).cljs$core$IFn$_invoke$arity$1(G__13358),new cljs.core.Keyword(null,"trace","trace",1124525239).cljs$core$IFn$_invoke$arity$1(G__13358),null,cljs.core.dissoc.call(null,G__13358,new cljs.core.Keyword(null,"message","message",1968829305),new cljs.core.Keyword(null,"line","line",1017226086),new cljs.core.Keyword(null,"file","file",1017047278),new cljs.core.Keyword(null,"trace","trace",1124525239))));
});
aurora.util.core.map_BANG_ = (function map_BANG_(f,xs){return cljs.core.doall.call(null,cljs.core.map.call(null,f,xs));
});
