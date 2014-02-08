// Compiled by ClojureScript .
goog.provide('aurora.compiler.ast');
goog.require('cljs.core');
goog.require('aurora.util.core');
goog.require('aurora.util.core');
aurora.compiler.ast.id_BANG_ = (function id_BANG_(index,x){try{if(typeof x === 'string')
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"string?","string?",772676615,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),6,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10082){if((e10082 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10082;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"id!","id!",-1640427489,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10082;
} else
{return null;
}
}
}});
aurora.compiler.ast.js_BANG_ = (function js_BANG_(index,x){try{if(typeof x === 'string')
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"string?","string?",772676615,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),9,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10084){if((e10084 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10084;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"js!","js!",-1640426063,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10084;
} else
{return null;
}
}
}});
aurora.compiler.ast.ref_id_BANG_ = (function ref_id_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword("ref","id","ref/id",1021254372),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),12,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),12,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10086){if((e10086 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10086;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"ref-id!","ref-id!",-557138971,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10086;
} else
{return null;
}
}
}});
aurora.compiler.ast.ref_js_BANG_ = (function ref_js_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword("ref","js","ref/js",1021254446),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),16,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.js_BANG_.call(null,index,new cljs.core.Keyword(null,"js","js",1013907643).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"js!","js!",-1640426063,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"js","js",1013907643),new cljs.core.Symbol(null,"x","x",-1640531407,null))),16,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10088){if((e10088 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10088;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"ref-js!","ref-js!",-557137545,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10088;
} else
{return null;
}
}
}});
aurora.compiler.ast.ref_BANG_ = (function ref_BANG_(index,x){try{var G__10092 = new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x);if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","js","ref/js",1021254446),G__10092))
{return aurora.compiler.ast.ref_js_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","id","ref/id",1021254372),G__10092))
{return aurora.compiler.ast.ref_id_BANG_.call(null,index,x);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,23,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}catch (e10091){if((e10091 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10091;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"ref!","ref!",-1637035097,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10091;
} else
{return null;
}
}
}});
aurora.compiler.ast.tag_BANG_ = (function tag_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"tag","tag",1014018828),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"tag","tag",1014018828),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),26,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),26,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(typeof new cljs.core.Keyword(null,"name","name",1017277949).cljs$core$IFn$_invoke$arity$1(x) === 'string')
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"string?","string?",772676615,null),cljs.core.list(new cljs.core.Keyword(null,"name","name",1017277949),new cljs.core.Symbol(null,"x","x",-1640531407,null))),26,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10094){if((e10094 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10094;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"tag!","tag!",-1636979328,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10094;
} else
{return null;
}
}
}});
aurora.compiler.ast.data_BANG_ = (function data_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"tag","tag",1014018828),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.tag_BANG_.call(null,index,x);
} else
{if(cljs.core.truth_(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword("ref","id","ref/id",1021254372),null,new cljs.core.Keyword("ref","js","ref/js",1021254446),null], null), null).call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x))))
{return aurora.compiler.ast.ref_BANG_.call(null,index,x);
} else
{if((x === true) || (x === false))
{return true;
} else
{if(typeof x === 'number')
{return true;
} else
{if(typeof x === 'string')
{return true;
} else
{if(cljs.core.vector_QMARK_.call(null,x))
{return cljs.core.every_QMARK_.call(null,(function (p1__10095_SHARP_){return data_BANG_.call(null,index,p1__10095_SHARP_);
}),x);
} else
{if(cljs.core.map_QMARK_.call(null,x))
{return (cljs.core.every_QMARK_.call(null,(function (p1__10096_SHARP_){return data_BANG_.call(null,index,p1__10096_SHARP_);
}),cljs.core.keys.call(null,x))) && (cljs.core.every_QMARK_.call(null,(function (p1__10097_SHARP_){return data_BANG_.call(null,index,p1__10097_SHARP_);
}),cljs.core.vals.call(null,x)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,40,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}
}
}
}
}
}catch (e10099){if((e10099 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10099;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"data!","data!",-1545175184,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10099;
} else
{return null;
}
}
}});
aurora.compiler.ast.constant_BANG_ = (function constant_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"constant","constant",4741060374),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"constant","constant",4741060374),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),43,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.data_BANG_.call(null,index,new cljs.core.Keyword(null,"data","data",1016980252).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"data!","data!",-1545175184,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"data","data",1016980252),new cljs.core.Symbol(null,"x","x",-1640531407,null))),43,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10101){if((e10101 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10101;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"constant!","constant!",-2062808394,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10101;
} else
{return null;
}
}
}});
aurora.compiler.ast.js_data_BANG_ = (function js_data_BANG_(index,x){try{if((x == null))
{return true;
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return aurora.compiler.ast.data_BANG_.call(null,index,x);
} else
{return null;
}
}
}catch (e10103){if((e10103 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10103;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"js-data!","js-data!",-1218853396,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10103;
} else
{return null;
}
}
}});
aurora.compiler.ast.call_BANG_ = (function call_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"call","call",1016950224),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),52,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.ref_BANG_.call(null,index,new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"ref!","ref!",-1637035097,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.Symbol(null,"x","x",-1640531407,null))),52,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.Symbol(null,"x","x",-1640531407,null))),52,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if((function (){var G__10109 = new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(x));if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","js","ref/js",1021254446),G__10109))
{return cljs.core.every_QMARK_.call(null,(function (p1__10105_SHARP_){return aurora.compiler.ast.js_data_BANG_.call(null,index,p1__10105_SHARP_);
}),new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(x));
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","id","ref/id",1021254372),G__10109))
{return cljs.core.every_QMARK_.call(null,(function (p1__10104_SHARP_){return aurora.compiler.ast.data_BANG_.call(null,index,p1__10104_SHARP_);
}),new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(x));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw (new Error([cljs.core.str("No matching clause: "),cljs.core.str(new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(x)))].join('')));
} else
{return null;
}
}
}
})())
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"case","case",-1637485335,null),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),cljs.core.list(new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.Symbol(null,"x","x",-1640531407,null))),new cljs.core.Keyword("ref","id","ref/id",1021254372),cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10104#","p1__10104#",1674230215,null)], null),cljs.core.list(new cljs.core.Symbol(null,"data!","data!",-1545175184,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10104#","p1__10104#",1674230215,null))),cljs.core.list(new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.Symbol(null,"x","x",-1640531407,null))),new cljs.core.Keyword("ref","js","ref/js",1021254446),cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10105#","p1__10105#",1674230246,null)], null),cljs.core.list(new cljs.core.Symbol(null,"js-data!","js-data!",-1218853396,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10105#","p1__10105#",1674230246,null))),cljs.core.list(new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.Symbol(null,"x","x",-1640531407,null)))),52,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10108){if((e10108 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10108;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"call!","call!",-1546106052,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10108;
} else
{return null;
}
}
}});
aurora.compiler.ast.match_any_BANG_ = (function match_any_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("match","any","match/any",3410918476),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword("match","any","match/any",3410918476),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),60,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10111){if((e10111 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10111;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"match-any!","match-any!",177985654,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10111;
} else
{return null;
}
}
}});
aurora.compiler.ast.match_bind_BANG_ = (function match_bind_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword("match","bind","match/bind",3414283803),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),63,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),63,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.pattern_BANG_.call(null,index,new cljs.core.Keyword(null,"pattern","pattern",4517781250).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"pattern!","pattern!",-394526646,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.Symbol(null,"x","x",-1640531407,null))),63,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10113){if((e10113 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10113;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"match-bind!","match-bind!",-1100307659,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10113;
} else
{return null;
}
}
}});
aurora.compiler.ast.pattern_BANG_ = (function pattern_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("match","any","match/any",3410918476),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.match_any_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.match_bind_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"tag","tag",1014018828),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.tag_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.ref_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return aurora.compiler.ast.call_BANG_.call(null,index,x);
} else
{if((x === true) || (x === false))
{return true;
} else
{if(typeof x === 'number')
{return true;
} else
{if(typeof x === 'string')
{return true;
} else
{if(cljs.core.vector_QMARK_.call(null,x))
{return cljs.core.every_QMARK_.call(null,(function (p1__10114_SHARP_){return pattern_BANG_.call(null,index,p1__10114_SHARP_);
}),x);
} else
{if(cljs.core.map_QMARK_.call(null,x))
{return (cljs.core.every_QMARK_.call(null,(function (p1__10115_SHARP_){return aurora.compiler.ast.data_BANG_.call(null,index,p1__10115_SHARP_);
}),cljs.core.keys.call(null,x))) && (cljs.core.every_QMARK_.call(null,(function (p1__10116_SHARP_){return pattern_BANG_.call(null,index,p1__10116_SHARP_);
}),cljs.core.vals.call(null,x)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,80,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}
}
}
}
}
}
}
}
}catch (e10118){if((e10118 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10118;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"pattern!","pattern!",-394526646,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10118;
} else
{return null;
}
}
}});
aurora.compiler.ast.branch_action_BANG_ = (function branch_action_BANG_(index,x){try{var G__10122 = new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x);if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"constant","constant",4741060374),G__10122))
{return aurora.compiler.ast.constant_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"call","call",1016950224),G__10122))
{return aurora.compiler.ast.call_BANG_.call(null,index,x);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,86,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}catch (e10121){if((e10121 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10121;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"branch-action!","branch-action!",-510326471,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10121;
} else
{return null;
}
}
}});
aurora.compiler.ast.branch_BANG_ = (function branch_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword("match","branch","match/branch",2096945282),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),89,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.pattern_BANG_.call(null,index,new cljs.core.Keyword(null,"pattern","pattern",4517781250).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"pattern!","pattern!",-394526646,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.Symbol(null,"x","x",-1640531407,null))),89,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"guards","guards",4073761248).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"guards","guards",4073761248),new cljs.core.Symbol(null,"x","x",-1640531407,null))),89,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.every_QMARK_.call(null,(function (p1__10123_SHARP_){return aurora.compiler.ast.call_BANG_.call(null,index,p1__10123_SHARP_);
}),new cljs.core.Keyword(null,"guards","guards",4073761248).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10123#","p1__10123#",1674232106,null)], null),cljs.core.list(new cljs.core.Symbol(null,"call!","call!",-1546106052,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10123#","p1__10123#",1674232106,null))),cljs.core.list(new cljs.core.Keyword(null,"guards","guards",4073761248),new cljs.core.Symbol(null,"x","x",-1640531407,null))),89,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.branch_action_BANG_.call(null,index,new cljs.core.Keyword(null,"action","action",3885920680).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"branch-action!","branch-action!",-510326471,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.Symbol(null,"x","x",-1640531407,null))),89,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10125){if((e10125 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10125;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"branch!","branch!",-1502803848,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10125;
} else
{return null;
}
}
}});
aurora.compiler.ast.match_BANG_ = (function match_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"match","match",1117572407),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"match","match",1117572407),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),96,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.data_BANG_.call(null,index,new cljs.core.Keyword(null,"arg","arg",1014001096).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"data!","data!",-1545175184,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"arg","arg",1014001096),new cljs.core.Symbol(null,"x","x",-1640531407,null))),96,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"branches","branches",988497218).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.Symbol(null,"x","x",-1640531407,null))),96,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.every_QMARK_.call(null,(function (p1__10126_SHARP_){return aurora.compiler.ast.branch_BANG_.call(null,index,p1__10126_SHARP_);
}),new cljs.core.Keyword(null,"branches","branches",988497218).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10126#","p1__10126#",1674232199,null)], null),cljs.core.list(new cljs.core.Symbol(null,"branch!","branch!",-1502803848,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10126#","p1__10126#",1674232199,null))),cljs.core.list(new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.Symbol(null,"x","x",-1640531407,null))),96,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10128){if((e10128 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10128;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"match!","match!",1573181621,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10128;
} else
{return null;
}
}
}});
aurora.compiler.ast.math_expression_BANG_ = (function math_expression_BANG_(index,x){try{if(cljs.core.truth_(((cljs.core.vector_QMARK_.call(null,x))?cljs.core.every_QMARK_.call(null,(function (p1__10129_SHARP_){return math_expression_BANG_.call(null,index,p1__10129_SHARP_);
}),x):((typeof x === 'number')?true:((new cljs.core.Keyword(null,"else","else",1017020587))?aurora.compiler.ast.ref_BANG_.call(null,index,x):null)))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"cond","cond",-1637472037,null),cljs.core.list(new cljs.core.Symbol(null,"vector?","vector?",-1302740715,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10129#","p1__10129#",1674232292,null)], null),cljs.core.list(new cljs.core.Symbol(null,"math-expression!","math-expression!",1474365181,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10129#","p1__10129#",1674232292,null))),new cljs.core.Symbol(null,"x","x",-1640531407,null)),cljs.core.list(new cljs.core.Symbol(null,"number?","number?",653920207,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),true,new cljs.core.Keyword(null,"else","else",1017020587),cljs.core.list(new cljs.core.Symbol(null,"ref!","ref!",-1637035097,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"x","x",-1640531407,null))),102,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10131){if((e10131 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10131;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"math-expression!","math-expression!",1474365181,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10131;
} else
{return null;
}
}
}});
aurora.compiler.ast.math_BANG_ = (function math_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"math","math",1017248378),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"math","math",1017248378),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),108,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(new cljs.core.Keyword(null,"expression","expression",3513419274).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Keyword(null,"expression","expression",3513419274),new cljs.core.Symbol(null,"x","x",-1640531407,null)),108,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.math_expression_BANG_.call(null,index,new cljs.core.Keyword(null,"expression","expression",3513419274).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"math-expression!","math-expression!",1474365181,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"expression","expression",3513419274),new cljs.core.Symbol(null,"x","x",-1640531407,null))),108,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10133){if((e10133 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10133;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"math!","math!",-1536863278,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10133;
} else
{return null;
}
}
}});
aurora.compiler.ast.step_BANG_ = (function step_BANG_(index,x){try{if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),113,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
var G__10137 = new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x);if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"math","math",1017248378),G__10137))
{return aurora.compiler.ast.math_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"match","match",1117572407),G__10137))
{return aurora.compiler.ast.match_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"constant","constant",4741060374),G__10137))
{return aurora.compiler.ast.constant_BANG_.call(null,index,x);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"call","call",1016950224),G__10137))
{return aurora.compiler.ast.call_BANG_.call(null,index,x);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,119,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}
}
}catch (e10136){if((e10136 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10136;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"step!","step!",-1530770290,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10136;
} else
{return null;
}
}
}});
aurora.compiler.ast.page_arg_BANG_ = (function page_arg_BANG_(index,x){try{return true;
}catch (e10139){if((e10139 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10139;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"page-arg!","page-arg!",-803386686,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10139;
} else
{return null;
}
}
}});
aurora.compiler.ast.page_BANG_ = (function page_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"page","page",1017337345),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.every_QMARK_.call(null,(function (p1__10140_SHARP_){return aurora.compiler.ast.page_arg_BANG_.call(null,index,cljs.core.get.call(null,index,p1__10140_SHARP_));
}),new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10140#","p1__10140#",1674233935,null)], null),cljs.core.list(new cljs.core.Symbol(null,"page-arg!","page-arg!",-803386686,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Symbol(null,"get","get",-1640429297,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10140#","p1__10140#",1674233935,null)))),cljs.core.list(new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.every_QMARK_.call(null,(function (p1__10141_SHARP_){return aurora.compiler.ast.step_BANG_.call(null,index,cljs.core.get.call(null,index,p1__10141_SHARP_));
}),new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10141#","p1__10141#",1674233966,null)], null),cljs.core.list(new cljs.core.Symbol(null,"step!","step!",-1530770290,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Symbol(null,"get","get",-1640429297,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10141#","p1__10141#",1674233966,null)))),cljs.core.list(new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.Symbol(null,"x","x",-1640531407,null))),125,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10143){if((e10143 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10143;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"page!","page!",-1534105301,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10143;
} else
{return null;
}
}
}});
aurora.compiler.ast.notebook_BANG_ = (function notebook_BANG_(index,x){try{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),new cljs.core.Keyword(null,"notebook","notebook",2595460429),cljs.core.list(new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Symbol(null,"x","x",-1640531407,null))),133,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.truth_(aurora.compiler.ast.id_BANG_.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"id!","id!",-1640427489,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Keyword(null,"id","id",1013907597),new cljs.core.Symbol(null,"x","x",-1640531407,null))),133,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.sequential_QMARK_.call(null,new cljs.core.Keyword(null,"pages","pages",1120330550).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"sequential?","sequential?",1865038041,null),cljs.core.list(new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.Symbol(null,"x","x",-1640531407,null))),133,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.every_QMARK_.call(null,(function (p1__10144_SHARP_){return aurora.compiler.ast.page_BANG_.call(null,index,cljs.core.get.call(null,index,p1__10144_SHARP_));
}),new cljs.core.Keyword(null,"pages","pages",1120330550).cljs$core$IFn$_invoke$arity$1(x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"every?","every?",1363110461,null),cljs.core.list(new cljs.core.Symbol(null,"fn*","fn*",-1640430053,null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Symbol(null,"p1__10144#","p1__10144#",1674234059,null)], null),cljs.core.list(new cljs.core.Symbol(null,"page!","page!",-1534105301,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),cljs.core.list(new cljs.core.Symbol(null,"get","get",-1640429297,null),new cljs.core.Symbol(null,"index","index",-1540185461,null),new cljs.core.Symbol(null,"p1__10144#","p1__10144#",1674234059,null)))),cljs.core.list(new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.Symbol(null,"x","x",-1640531407,null))),133,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
}catch (e10146){if((e10146 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e10146;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"notebook!","notebook!",143070047,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e10146;
} else
{return null;
}
}
}});
aurora.compiler.ast.example_a = new cljs.core.PersistentArrayMap(null, 6, ["example_a",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597),"example_a",new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["root"], null)], null),"root",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),"root",new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, ["a","b","c"], null),new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, ["b_squared","four","four_a_c","result"], null)], null),"b_squared",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"id","id",1013907597),"b_squared",new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core._STAR_"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b"], null)], null)], null),"four",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"constant","constant",4741060374),new cljs.core.Keyword(null,"id","id",1013907597),"four",new cljs.core.Keyword(null,"data","data",1016980252),4], null),"four_a_c",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"id","id",1013907597),"four_a_c",new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core._STAR_"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"four"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"a"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"c"], null)], null)], null),"result",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"id","id",1013907597),"result",new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core._"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b_squared"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"four_a_c"], null)], null)], null)], null);
aurora.compiler.ast.notebook_BANG_.call(null,aurora.compiler.ast.example_a,cljs.core.get.call(null,aurora.compiler.ast.example_a,"example_a"));
aurora.compiler.ast.example_b = new cljs.core.PersistentArrayMap(null, 5, ["example_b",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597),"example_b",new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, ["root","vec"], null)], null),"root",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),"root",new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["x"], null),new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["result"], null)], null),"result",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"id","id",1013907597),"result",new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"match","match",1117572407),new cljs.core.Keyword(null,"arg","arg",1014001096),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"x"], null),new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 2, ["a",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"id","id",1013907597),"a",new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","any","match/any",3410918476)], null)], null),"b",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"id","id",1013907597),"b",new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","any","match/any",3410918476)], null)], null)], null),new cljs.core.Keyword(null,"guards","guards",4073761248),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core.number_QMARK_.call"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [null,new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b"], null)], null)], null),new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core.number_QMARK_.call"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [null,new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b"], null)], null)], null)], null),new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core._"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"a"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"b"], null)], null)], null)], null),new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, ["vec",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"id","id",1013907597),"y",new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","any","match/any",3410918476)], null)], null)], null),new cljs.core.Keyword(null,"guards","guards",4073761248),cljs.core.PersistentVector.EMPTY,new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"vec"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"y"], null)], null)], null)], null)], null)], null),"vec",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),"vec",new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["y"], null),new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["vec_result"], null)], null),"vec_result",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"id","id",1013907597),"vec_result",new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"match","match",1117572407),new cljs.core.Keyword(null,"arg","arg",1014001096),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"y"], null),new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"id","id",1013907597),"z",new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","any","match/any",3410918476)], null)], null),"foo"], null),new cljs.core.Keyword(null,"guards","guards",4073761248),cljs.core.PersistentVector.EMPTY,new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"replace"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"z"], null),"more foo!"], null)], null)], null)], null)], null)], null);
aurora.compiler.ast.notebook_BANG_.call(null,aurora.compiler.ast.example_b,cljs.core.get.call(null,aurora.compiler.ast.example_b,"example_b"));
aurora.compiler.ast.example_c = new cljs.core.PersistentArrayMap(null, 5, ["example_c",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597),"example_c",new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["root"], null)], null),"root",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),"root",new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["x"], null),new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, ["counter","inced","new_counter"], null)], null),"counter",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"match","match",1117572407),new cljs.core.Keyword(null,"id","id",1013907597),"counter",new cljs.core.Keyword(null,"arg","arg",1014001096),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"x"], null),new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, ["counter",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","bind","match/bind",3414283803),new cljs.core.Keyword(null,"id","id",1013907597),"y",new cljs.core.Keyword(null,"pattern","pattern",4517781250),new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","any","match/any",3410918476)], null)], null)], null),new cljs.core.Keyword(null,"guards","guards",4073761248),cljs.core.PersistentVector.EMPTY,new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"constant","constant",4741060374),new cljs.core.Keyword(null,"data","data",1016980252),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"y"], null)], null)], null)], null)], null),"inced",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"id","id",1013907597),"inced",new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"cljs.core._PLUS_"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"counter"], null),1], null)], null),"new_counter",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"id","id",1013907597),"new_counter",new cljs.core.Keyword(null,"ref","ref",1014017029),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"replace"], null),new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"counter"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),"inced"], null)], null)], null)], null);
aurora.compiler.ast.notebook_BANG_.call(null,aurora.compiler.ast.example_c,cljs.core.get.call(null,aurora.compiler.ast.example_c,"example_c"));
aurora.compiler.ast.example_math = new cljs.core.PersistentArrayMap(null, 3, ["example_math",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597),"example_math",new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["root"], null)], null),"root",new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),"root",new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["x"], null),new cljs.core.Keyword(null,"steps","steps",1123665561),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["expression"], null)], null),"expression",new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"math","math",1017248378),new cljs.core.Keyword(null,"id","id",1013907597),"expression",new cljs.core.Keyword(null,"expression","expression",3513419274),new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"+"], null),4,new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"-"], null),3,4,6], null),5], null)], null)], null);
aurora.compiler.ast.notebook_BANG_.call(null,aurora.compiler.ast.example_math,cljs.core.get.call(null,aurora.compiler.ast.example_math,"example_math"));
