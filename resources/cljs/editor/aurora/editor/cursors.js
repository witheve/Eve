// Compiled by ClojureScript .
goog.provide('aurora.editor.cursors');
goog.require('cljs.core');
goog.require('aurora.editor.core');
goog.require('aurora.editor.core');
aurora.editor.cursors.ICursor = (function (){var obj6229 = {};return obj6229;
})();
aurora.editor.cursors._conj_path_BANG_ = (function _conj_path_BANG_(this$,x){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2(this$,x);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.editor.cursors._conj_path_BANG_[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.editor.cursors._conj_path_BANG_["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ICursor.-conj-path!",this$);
}
}
})().call(null,this$,x);
}
});
aurora.editor.cursors._index_path = (function _index_path(this$){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$editor$cursors$ICursor$_index_path$arity$1;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$editor$cursors$ICursor$_index_path$arity$1(this$);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.editor.cursors._index_path[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.editor.cursors._index_path["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ICursor.-index-path",this$);
}
}
})().call(null,this$);
}
});
aurora.editor.cursors.map_key_path_QMARK_ = (function map_key_path_QMARK_(path){return new cljs.core.Keyword("aurora.editor.ui","key","aurora.editor.ui/key",4080100511).cljs$core$IFn$_invoke$arity$1(cljs.core.last.call(null,path));
});
aurora.editor.cursors.mutable_QMARK_ = (function mutable_QMARK_(cursor){return cljs.core.not.call(null,(cursor["locked"]));
});

/**
* @constructor
*/
aurora.editor.cursors.IndexCursor = (function (atm,id,sub_path){
this.atm = atm;
this.id = id;
this.sub_path = sub_path;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2153807880;
})
aurora.editor.cursors.IndexCursor.cljs$lang$type = true;
aurora.editor.cursors.IndexCursor.cljs$lang$ctorStr = "aurora.editor.cursors/IndexCursor";
aurora.editor.cursors.IndexCursor.cljs$lang$ctorPrWriter = (function (this__3906__auto__,writer__3907__auto__,opt__3908__auto__){return cljs.core._write.call(null,writer__3907__auto__,"aurora.editor.cursors/IndexCursor");
});
aurora.editor.cursors.IndexCursor.prototype.cljs$core$IHash$_hash$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return goog.getUid(this$__$1);
});
aurora.editor.cursors.IndexCursor.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this$,writer,opts){var self__ = this;
var this$__$1 = this;return cljs.core._write.call(null,writer,[cljs.core.str("#<Cursor: "),cljs.core.str(cljs.core.pr_str.call(null,aurora.editor.cursors._index_path.call(null,this$__$1))),cljs.core.str(">")].join(''));
});
aurora.editor.cursors.IndexCursor.prototype.cljs$core$IDeref$_deref$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;var path = aurora.editor.cursors._index_path.call(null,this$__$1);var or__3357__auto__ = aurora.editor.cursors.map_key_path_QMARK_.call(null,path);if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return cljs.core.get_in.call(null,cljs.core.deref.call(null,self__.atm),path);
}
});
aurora.editor.cursors.IndexCursor.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (o,other){var self__ = this;
var o__$1 = this;return (o__$1 === other);
});
aurora.editor.cursors.IndexCursor.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this$,x){var self__ = this;
var this$__$1 = this;return aurora.editor.cursors._conj_path_BANG_.call(null,this$__$1,x);
});
aurora.editor.cursors.IndexCursor.prototype.aurora$editor$cursors$ICursor$ = true;
aurora.editor.cursors.IndexCursor.prototype.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2 = (function (this$,neue){var self__ = this;
var this$__$1 = this;var neue__$1 = ((cljs.core.coll_QMARK_.call(null,neue))?neue:new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [neue], null));return (new aurora.editor.cursors.IndexCursor(self__.atm,self__.id,cljs.core.into.call(null,self__.sub_path,neue__$1)));
});
aurora.editor.cursors.IndexCursor.prototype.aurora$editor$cursors$ICursor$_index_path$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"index","index",1114250308),self__.id], null),self__.sub_path);
});
aurora.editor.cursors.__GT_IndexCursor = (function __GT_IndexCursor(atm,id,sub_path){return (new aurora.editor.cursors.IndexCursor(atm,id,sub_path));
});
aurora.editor.cursors.cursor = (function cursor(id){if(cljs.core.truth_(cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"index","index",1114250308),id], null))))
{return (new aurora.editor.cursors.IndexCursor(aurora.editor.core.aurora_state,id,cljs.core.PersistentVector.EMPTY));
} else
{return null;
}
});
aurora.editor.cursors.cursors = (function cursors(ids){return cljs.core.map.call(null,aurora.editor.cursors.cursor,ids);
});
aurora.editor.cursors.cursor__GT_path = (function cursor__GT_path(c){return aurora.editor.cursors._index_path.call(null,c);
});
aurora.editor.cursors.cursor__GT_id = (function cursor__GT_id(c){return c.id;
});
aurora.editor.cursors.cursor_swap_BANG_ = (function cursor_swap_BANG_(cursor,args){if(aurora.editor.cursors.mutable_QMARK_.call(null,cursor))
{var path = aurora.editor.cursors._index_path.call(null,cursor);var map_key_QMARK_ = aurora.editor.cursors.map_key_path_QMARK_.call(null,path);var root_value = cljs.core.deref.call(null,cursor.atm);var neue_value = cljs.core.apply.call(null,cljs.core.first.call(null,args),cljs.core.deref.call(null,cursor),cljs.core.rest.call(null,args));if(cljs.core.truth_(map_key_QMARK_))
{return cljs.core.swap_BANG_.call(null,cursor.atm,cljs.core.assoc_in,cljs.core.butlast.call(null,path),cljs.core.assoc.call(null,cljs.core.dissoc.call(null,cljs.core.get_in.call(null,root_value,cljs.core.butlast.call(null,path)),map_key_QMARK_),neue_value,(function (){var or__3357__auto__ = cljs.core.get_in.call(null,root_value,cljs.core.concat.call(null,cljs.core.butlast.call(null,path),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [map_key_QMARK_], null)));if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return "";
}
})()));
} else
{return cljs.core.swap_BANG_.call(null,cursor.atm,cljs.core.assoc_in,path,neue_value);
}
} else
{return null;
}
});
/**
* @param {...*} var_args
*/
aurora.editor.cursors.swap_BANG_ = (function() { 
var swap_BANG___delegate = function (atm,args){if(!((function (){var G__6231 = atm;if(G__6231)
{var bit__3988__auto__ = null;if(cljs.core.truth_((function (){var or__3357__auto__ = bit__3988__auto__;if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return G__6231.aurora$editor$cursors$ICursor$;
}
})()))
{return true;
} else
{if((!G__6231.cljs$lang$protocol_mask$partition$))
{return cljs.core.native_satisfies_QMARK_.call(null,aurora.editor.cursors.ICursor,G__6231);
} else
{return false;
}
}
} else
{return cljs.core.native_satisfies_QMARK_.call(null,aurora.editor.cursors.ICursor,G__6231);
}
})()))
{return cljs.core.apply.call(null,cljs.core.swap_BANG_,atm,args);
} else
{return aurora.editor.cursors.cursor_swap_BANG_.call(null,atm,args);
}
};
var swap_BANG_ = function (atm,var_args){
var args = null;if (arguments.length > 1) {
  args = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return swap_BANG___delegate.call(this,atm,args);};
swap_BANG_.cljs$lang$maxFixedArity = 1;
swap_BANG_.cljs$lang$applyTo = (function (arglist__6232){
var atm = cljs.core.first(arglist__6232);
var args = cljs.core.rest(arglist__6232);
return swap_BANG___delegate(atm,args);
});
swap_BANG_.cljs$core$IFn$_invoke$arity$variadic = swap_BANG___delegate;
return swap_BANG_;
})()
;

/**
* @constructor
*/
aurora.editor.cursors.OverlayCursor = (function (atm,id,value,sub_path){
this.atm = atm;
this.id = id;
this.value = value;
this.sub_path = sub_path;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2153807880;
})
aurora.editor.cursors.OverlayCursor.cljs$lang$type = true;
aurora.editor.cursors.OverlayCursor.cljs$lang$ctorStr = "aurora.editor.cursors/OverlayCursor";
aurora.editor.cursors.OverlayCursor.cljs$lang$ctorPrWriter = (function (this__3906__auto__,writer__3907__auto__,opt__3908__auto__){return cljs.core._write.call(null,writer__3907__auto__,"aurora.editor.cursors/OverlayCursor");
});
aurora.editor.cursors.OverlayCursor.prototype.cljs$core$IHash$_hash$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return goog.getUid(this$__$1);
});
aurora.editor.cursors.OverlayCursor.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this$,writer,opts){var self__ = this;
var this$__$1 = this;return cljs.core._write.call(null,writer,[cljs.core.str("#<OverlayCursor: "),cljs.core.str(cljs.core.pr_str.call(null,aurora.editor.cursors._index_path.call(null,this$__$1))),cljs.core.str(">")].join(''));
});
aurora.editor.cursors.OverlayCursor.prototype.cljs$core$IDeref$_deref$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;var path = aurora.editor.cursors._index_path.call(null,this$__$1);var or__3357__auto__ = aurora.editor.cursors.map_key_path_QMARK_.call(null,path);if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return cljs.core.get_in.call(null,self__.value,cljs.core.drop.call(null,2,path));
}
});
aurora.editor.cursors.OverlayCursor.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (o,other){var self__ = this;
var o__$1 = this;return (o__$1 === other);
});
aurora.editor.cursors.OverlayCursor.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this$,x){var self__ = this;
var this$__$1 = this;return aurora.editor.cursors._conj_path_BANG_.call(null,this$__$1,x);
});
aurora.editor.cursors.OverlayCursor.prototype.aurora$editor$cursors$ICursor$ = true;
aurora.editor.cursors.OverlayCursor.prototype.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2 = (function (this$,neue){var self__ = this;
var this$__$1 = this;var neue__$1 = ((cljs.core.coll_QMARK_.call(null,neue))?neue:new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [neue], null));return (new aurora.editor.cursors.OverlayCursor(self__.atm,self__.value,cljs.core.into.call(null,self__.sub_path,neue__$1)));
});
aurora.editor.cursors.OverlayCursor.prototype.aurora$editor$cursors$ICursor$_index_path$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"index","index",1114250308),self__.id], null),self__.sub_path);
});
aurora.editor.cursors.__GT_OverlayCursor = (function __GT_OverlayCursor(atm,id,value,sub_path){return (new aurora.editor.cursors.OverlayCursor(atm,id,value,sub_path));
});
aurora.editor.cursors.overlay_cursor = (function overlay_cursor(cursor,value){return (new aurora.editor.cursors.OverlayCursor(cursor.atm,cursor.id,value,cursor.sub_path));
});

/**
* @constructor
*/
aurora.editor.cursors.LockedCursor = (function (cursor,locked){
this.cursor = cursor;
this.locked = locked;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2153807880;
})
aurora.editor.cursors.LockedCursor.cljs$lang$type = true;
aurora.editor.cursors.LockedCursor.cljs$lang$ctorStr = "aurora.editor.cursors/LockedCursor";
aurora.editor.cursors.LockedCursor.cljs$lang$ctorPrWriter = (function (this__3906__auto__,writer__3907__auto__,opt__3908__auto__){return cljs.core._write.call(null,writer__3907__auto__,"aurora.editor.cursors/LockedCursor");
});
aurora.editor.cursors.LockedCursor.prototype.cljs$core$IHash$_hash$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return goog.getUid(this$__$1);
});
aurora.editor.cursors.LockedCursor.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this$,writer,opts){var self__ = this;
var this$__$1 = this;return cljs.core._write.call(null,writer,[cljs.core.str("#<LockedCursor: "),cljs.core.str(cljs.core.pr_str.call(null,aurora.editor.cursors._index_path.call(null,this$__$1))),cljs.core.str(">")].join(''));
});
aurora.editor.cursors.LockedCursor.prototype.cljs$core$IDeref$_deref$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return cljs.core.deref.call(null,self__.cursor);
});
aurora.editor.cursors.LockedCursor.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (o,other){var self__ = this;
var o__$1 = this;return (o__$1 === other);
});
aurora.editor.cursors.LockedCursor.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this$,x){var self__ = this;
var this$__$1 = this;return aurora.editor.cursors._conj_path_BANG_.call(null,this$__$1,x);
});
aurora.editor.cursors.LockedCursor.prototype.aurora$editor$cursors$ICursor$ = true;
aurora.editor.cursors.LockedCursor.prototype.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2 = (function (this$,neue){var self__ = this;
var this$__$1 = this;return (new aurora.editor.cursors.LockedCursor(cljs.core.conj.call(null,self__.cursor,neue)));
});
aurora.editor.cursors.LockedCursor.prototype.aurora$editor$cursors$ICursor$_index_path$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return aurora.editor.cursors._index_path.call(null,self__.cursor);
});
aurora.editor.cursors.__GT_LockedCursor = (function __GT_LockedCursor(cursor,locked){return (new aurora.editor.cursors.LockedCursor(cursor,locked));
});
aurora.editor.cursors.__GT_locked = (function __GT_locked(cursor){return (new aurora.editor.cursors.LockedCursor(cursor,true));
});

/**
* @constructor
*/
aurora.editor.cursors.ValueCursor = (function (value,sub_path,locked){
this.value = value;
this.sub_path = sub_path;
this.locked = locked;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2153807880;
})
aurora.editor.cursors.ValueCursor.cljs$lang$type = true;
aurora.editor.cursors.ValueCursor.cljs$lang$ctorStr = "aurora.editor.cursors/ValueCursor";
aurora.editor.cursors.ValueCursor.cljs$lang$ctorPrWriter = (function (this__3906__auto__,writer__3907__auto__,opt__3908__auto__){return cljs.core._write.call(null,writer__3907__auto__,"aurora.editor.cursors/ValueCursor");
});
aurora.editor.cursors.ValueCursor.prototype.cljs$core$IHash$_hash$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return goog.getUid(this$__$1);
});
aurora.editor.cursors.ValueCursor.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this$,writer,opts){var self__ = this;
var this$__$1 = this;return cljs.core._write.call(null,writer,[cljs.core.str("#<ValueCursor: "),cljs.core.str(cljs.core.pr_str.call(null,aurora.editor.cursors._index_path.call(null,this$__$1))),cljs.core.str(">")].join(''));
});
aurora.editor.cursors.ValueCursor.prototype.cljs$core$IDeref$_deref$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;var path = aurora.editor.cursors._index_path.call(null,this$__$1);var or__3357__auto__ = aurora.editor.cursors.map_key_path_QMARK_.call(null,path);if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return cljs.core.get_in.call(null,self__.value,path);
}
});
aurora.editor.cursors.ValueCursor.prototype.cljs$core$IEquiv$_equiv$arity$2 = (function (o,other){var self__ = this;
var o__$1 = this;return (o__$1 === other);
});
aurora.editor.cursors.ValueCursor.prototype.cljs$core$ICollection$_conj$arity$2 = (function (this$,x){var self__ = this;
var this$__$1 = this;return aurora.editor.cursors._conj_path_BANG_.call(null,this$__$1,x);
});
aurora.editor.cursors.ValueCursor.prototype.aurora$editor$cursors$ICursor$ = true;
aurora.editor.cursors.ValueCursor.prototype.aurora$editor$cursors$ICursor$_conj_path_BANG_$arity$2 = (function (this$,neue){var self__ = this;
var this$__$1 = this;var neue__$1 = ((cljs.core.coll_QMARK_.call(null,neue))?neue:new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [neue], null));return (new aurora.editor.cursors.ValueCursor(self__.value,cljs.core.into.call(null,self__.sub_path,neue__$1),self__.locked));
});
aurora.editor.cursors.ValueCursor.prototype.aurora$editor$cursors$ICursor$_index_path$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return self__.sub_path;
});
aurora.editor.cursors.__GT_ValueCursor = (function __GT_ValueCursor(value,sub_path,locked){return (new aurora.editor.cursors.ValueCursor(value,sub_path,locked));
});
aurora.editor.cursors.value_cursor = (function value_cursor(value){return (new aurora.editor.cursors.ValueCursor(value,cljs.core.PersistentVector.EMPTY,true));
});
