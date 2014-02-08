// Compiled by ClojureScript .
goog.provide('aurora.compiler.jsth');
goog.require('cljs.core');
goog.require('clojure.string');
goog.require('aurora.util.core');
goog.require('aurora.util.core');
goog.require('clojure.string');
aurora.compiler.jsth.infix_ops = new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 5, ["%",null,"*",null,"+",null,"-",null,"/",null], null), null);
aurora.compiler.jsth.head = (function head(x){new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [x], null);
try{return cljs.core.name.call(null,cljs.core.first.call(null,x));
}catch (e6202){var _ = e6202;return null;
}});
aurora.compiler.jsth.indent = (function indent(lines){return clojure.string.join.call(null,"\n",(function (){var iter__4055__auto__ = (function iter__6207(s__6208){return (new cljs.core.LazySeq(null,(function (){var s__6208__$1 = s__6208;while(true){
var temp__4092__auto__ = cljs.core.seq.call(null,s__6208__$1);if(temp__4092__auto__)
{var s__6208__$2 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,s__6208__$2))
{var c__4053__auto__ = cljs.core.chunk_first.call(null,s__6208__$2);var size__4054__auto__ = cljs.core.count.call(null,c__4053__auto__);var b__6210 = cljs.core.chunk_buffer.call(null,size__4054__auto__);if((function (){var i__6209 = 0;while(true){
if((i__6209 < size__4054__auto__))
{var line = cljs.core._nth.call(null,c__4053__auto__,i__6209);cljs.core.chunk_append.call(null,b__6210,[cljs.core.str("  "),cljs.core.str(line)].join(''));
{
var G__6211 = (i__6209 + 1);
i__6209 = G__6211;
continue;
}
} else
{return true;
}
break;
}
})())
{return cljs.core.chunk_cons.call(null,cljs.core.chunk.call(null,b__6210),iter__6207.call(null,cljs.core.chunk_rest.call(null,s__6208__$2)));
} else
{return cljs.core.chunk_cons.call(null,cljs.core.chunk.call(null,b__6210),null);
}
} else
{var line = cljs.core.first.call(null,s__6208__$2);return cljs.core.cons.call(null,[cljs.core.str("  "),cljs.core.str(line)].join(''),iter__6207.call(null,cljs.core.rest.call(null,s__6208__$2)));
}
} else
{return null;
}
break;
}
}),null,null));
});return iter__4055__auto__.call(null,clojure.string.split_lines.call(null,lines));
})());
});
aurora.compiler.jsth.data__GT_string = (function data__GT_string(x){try{if((x == null))
{return "null";
} else
{if((x === true) || (x === false))
{return [cljs.core.str(x)].join('');
} else
{if(typeof x === 'number')
{return [cljs.core.str(x)].join('');
} else
{if(typeof x === 'string')
{return cljs.core.pr_str.call(null,x);
} else
{if(cljs.core.vector_QMARK_.call(null,x))
{return [cljs.core.str("["),cljs.core.str(clojure.string.join.call(null,", ",cljs.core.map.call(null,aurora.compiler.jsth.expression__GT_string,x))),cljs.core.str("]")].join('');
} else
{if(cljs.core.map_QMARK_.call(null,x))
{if(cljs.core.empty_QMARK_.call(null,x))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"empty?","empty?",1355128395,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),21,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("{"),cljs.core.str("}")].join('');
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
}
}
}
}
}catch (e6213){if((e6213 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e6213;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"data->string","data->string",-962216859,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e6213;
} else
{return null;
}
}
}});
aurora.compiler.jsth.name__GT_string = (function name__GT_string(x){try{if((x instanceof cljs.core.Symbol))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"symbol?","symbol?",910997344,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),26,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return cljs.core.name.call(null,x);
}catch (e6215){if((e6215 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e6215;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"name->string","name->string",-1230645690,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e6215;
} else
{return null;
}
}
}});
aurora.compiler.jsth.var__GT_string = (function var__GT_string(x){try{if((x instanceof cljs.core.Symbol))
{return aurora.compiler.jsth.name__GT_string.call(null,x);
} else
{if(cljs.core._EQ_.call(null,"get!",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),32,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str("["),cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,2))),cljs.core.str("]")].join('');
} else
{if(cljs.core._EQ_.call(null,"..",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),34,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str("."),cljs.core.str(aurora.compiler.jsth.name__GT_string.call(null,cljs.core.nth.call(null,x,2)))].join('');
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,36,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return true;
} else
{return null;
}
}
}
}
}catch (e6217){if((e6217 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e6217;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"var->string","var->string",-1290025246,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e6217;
} else
{return null;
}
}
}});
aurora.compiler.jsth.expression__GT_string = (function expression__GT_string(x){try{if(cljs.core.truth_((function (){var or__3357__auto__ = (x instanceof cljs.core.Symbol);if(or__3357__auto__)
{return or__3357__auto__;
} else
{return new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, ["..",null,"get!",null], null), null).call(null,aurora.compiler.jsth.head.call(null,x));
}
})()))
{return aurora.compiler.jsth.var__GT_string.call(null,x);
} else
{if(((x == null)) || (x === true) || (x === false) || (typeof x === 'number') || (typeof x === 'string') || (cljs.core.vector_QMARK_.call(null,x)) || (cljs.core.map_QMARK_.call(null,x)))
{return aurora.compiler.jsth.data__GT_string.call(null,x);
} else
{if(cljs.core._EQ_.call(null,"=",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),42,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(" == "),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,2)))].join('');
} else
{if(cljs.core._EQ_.call(null,"==",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),44,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(" === "),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,2)))].join('');
} else
{if(cljs.core._EQ_.call(null,"not",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),2))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),2),46,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("!("),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(")")].join('');
} else
{if(cljs.core._EQ_.call(null,"?",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,4,cljs.core.count.call(null,x)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),4,cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null))),48,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("("),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(") ? ("),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,2))),cljs.core.str(") : ("),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,3))),cljs.core.str(")")].join('');
} else
{if(cljs.core._EQ_.call(null,"fn",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),5))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),5),50,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core.vector_QMARK_.call(null,cljs.core.nth.call(null,x,2)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"vector?","vector?",-1302740715,null),cljs.core.list(new cljs.core.Symbol(null,"nth","nth",-1640422117,null),new cljs.core.Symbol(null,"x","x",-1640531407,null),2)),50,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("function "),cljs.core.str((cljs.core.truth_(cljs.core.nth.call(null,x,1))?aurora.compiler.jsth.name__GT_string.call(null,cljs.core.nth.call(null,x,1)):null)),cljs.core.str("("),cljs.core.str(clojure.string.join.call(null,", ",cljs.core.map.call(null,aurora.compiler.jsth.name__GT_string,cljs.core.nth.call(null,x,2)))),cljs.core.str(") {\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,aurora.compiler.jsth.statement__GT_string.call(null,cljs.core.nth.call(null,x,3)))),cljs.core.str("\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,[cljs.core.str("return "),cljs.core.str(expression__GT_string.call(null,cljs.core.nth.call(null,x,4))),cljs.core.str(";")].join(''))),cljs.core.str("\n"),cljs.core.str("}")].join('');
} else
{if(cljs.core.truth_(aurora.compiler.jsth.infix_ops.call(null,aurora.compiler.jsth.head.call(null,x))))
{return [cljs.core.str("("),cljs.core.str(cljs.core.apply.call(null,cljs.core.str,cljs.core.interpose.call(null,[cljs.core.str(" "),cljs.core.str(aurora.compiler.jsth.head.call(null,x)),cljs.core.str(" ")].join(''),cljs.core.map.call(null,expression__GT_string,cljs.core.rest.call(null,x))))),cljs.core.str(")")].join('');
} else
{if(cljs.core.seq_QMARK_.call(null,x))
{if((cljs.core.count.call(null,x) >= 1))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,">=",">=",-1640529544,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),1),59,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
var f = expression__GT_string.call(null,cljs.core.nth.call(null,x,0));var args = cljs.core.map.call(null,expression__GT_string,cljs.core.rest.call(null,x));return [cljs.core.str(f),cljs.core.str("("),cljs.core.str(clojure.string.join.call(null,", ",args)),cljs.core.str(")")].join('');
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{if(false)
{} else
{throw (new aurora.util.core.FailedCheck(false,63,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
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
}catch (e6219){if((e6219 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e6219;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"expression->string","expression->string",-179334829,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e6219;
} else
{return null;
}
}
}});
aurora.compiler.jsth.statement__GT_string = (function statement__GT_string(x){try{if(cljs.core._EQ_.call(null,"do",aurora.compiler.jsth.head.call(null,x)))
{return clojure.string.join.call(null,"\n",cljs.core.map.call(null,statement__GT_string,cljs.core.rest.call(null,x)));
} else
{if(cljs.core._EQ_.call(null,"if",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core.truth_(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [3,null,4,null], null), null).call(null,cljs.core.count.call(null,x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [3,null,4,null], null), null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null))),68,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("if ("),cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(") {\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,statement__GT_string.call(null,cljs.core.nth.call(null,x,2)))),cljs.core.str("\n"),cljs.core.str("}"),cljs.core.str(((cljs.core._EQ_.call(null,cljs.core.count.call(null,x),4))?[cljs.core.str("else {\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,statement__GT_string.call(null,cljs.core.nth.call(null,x,3)))),cljs.core.str("\n"),cljs.core.str("}")].join(''):null))].join('');
} else
{if(cljs.core._EQ_.call(null,"let!",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),76,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("var "),cljs.core.str(aurora.compiler.jsth.name__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(" = "),cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,2))),cljs.core.str(";")].join('');
} else
{if(cljs.core._EQ_.call(null,"set!",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),3),78,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(aurora.compiler.jsth.var__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(" = "),cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,2))),cljs.core.str(";")].join('');
} else
{if(cljs.core._EQ_.call(null,"throw",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core._EQ_.call(null,cljs.core.count.call(null,x),2))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null)),2),80,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("throw "),cljs.core.str(aurora.compiler.jsth.expression__GT_string.call(null,cljs.core.nth.call(null,x,1))),cljs.core.str(";")].join('');
} else
{if(cljs.core._EQ_.call(null,"try",aurora.compiler.jsth.head.call(null,x)))
{if(cljs.core.truth_(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [2,null,3,null], null), null).call(null,cljs.core.count.call(null,x))))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [2,null,3,null], null), null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"x","x",-1640531407,null))),82,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str("try {\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,statement__GT_string.call(null,cljs.core.nth.call(null,x,1)))),cljs.core.str("\n"),cljs.core.str("}"),cljs.core.str(((cljs.core._EQ_.call(null,3,cljs.core.count.call(null,x)))?(function (){var catch$ = cljs.core.nth.call(null,x,2);if(cljs.core._EQ_.call(null,cljs.core.count.call(null,catch$),3))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),cljs.core.list(new cljs.core.Symbol(null,"count","count",-1545680184,null),new cljs.core.Symbol(null,"catch","catch",-1546098572,null)),3),88,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
if(cljs.core._EQ_.call(null,"catch",aurora.compiler.jsth.head.call(null,catch$)))
{} else
{throw (new aurora.util.core.FailedCheck(cljs.core.list(new cljs.core.Symbol(null,"=","=",-1640531466,null),"catch",cljs.core.list(new cljs.core.Symbol(null,"head","head",-1637333095,null),new cljs.core.Symbol(null,"catch","catch",-1546098572,null))),88,"/private/var/folders/k0/4c67txlx0x1cr1rpx5qncpzr0000gn/T/form-init7183985637918130551.clj",cljs.core.PersistentVector.EMPTY));
}
return [cljs.core.str(" catch ("),cljs.core.str(aurora.compiler.jsth.name__GT_string.call(null,cljs.core.nth.call(null,catch$,1))),cljs.core.str(") {\n"),cljs.core.str(aurora.compiler.jsth.indent.call(null,statement__GT_string.call(null,cljs.core.nth.call(null,catch$,2)))),cljs.core.str("\n"),cljs.core.str("}")].join('');
})():null))].join('');
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return aurora.compiler.jsth.expression__GT_string.call(null,x);
} else
{return null;
}
}
}
}
}
}
}
}catch (e6221){if((e6221 instanceof aurora.util.core.FailedCheck))
{var e__4717__auto__ = e6221;throw cljs.core.update_in.call(null,e__4717__auto__,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"trace","trace",1124525239)], null),cljs.core.conj,cljs.core._conj.call(null,cljs.core._conj.call(null,cljs.core.List.EMPTY,x),new cljs.core.Symbol(null,"statement->string","statement->string",-1752276694,null)));
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw e6221;
} else
{return null;
}
}
}});
