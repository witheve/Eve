// Compiled by ClojureScript .
goog.provide('aurora.util.dom');
goog.require('cljs.core');
aurora.util.dom.lazy_nl_via_item = (function() {
var lazy_nl_via_item = null;
var lazy_nl_via_item__1 = (function (nl){return lazy_nl_via_item.call(null,nl,0);
});
var lazy_nl_via_item__2 = (function (nl,n){if((n < nl.length))
{return (new cljs.core.LazySeq(null,(function (){return cljs.core.cons.call(null,nl.item(n),lazy_nl_via_item.call(null,nl,(n + 1)));
}),null,null));
} else
{return null;
}
});
lazy_nl_via_item = function(nl,n){
switch(arguments.length){
case 1:
return lazy_nl_via_item__1.call(this,nl);
case 2:
return lazy_nl_via_item__2.call(this,nl,n);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
lazy_nl_via_item.cljs$core$IFn$_invoke$arity$1 = lazy_nl_via_item__1;
lazy_nl_via_item.cljs$core$IFn$_invoke$arity$2 = lazy_nl_via_item__2;
return lazy_nl_via_item;
})()
;
HTMLCollection.prototype.cljs$core$IIndexed$ = true;
HTMLCollection.prototype.cljs$core$IIndexed$_nth$arity$2 = (function (this$,n){var this$__$1 = this;return this$__$1.item(n);
});
HTMLCollection.prototype.cljs$core$IIndexed$_nth$arity$3 = (function (this$,n,not_found){var this$__$1 = this;var or__3357__auto__ = this$__$1.item(n);if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return not_found;
}
});
HTMLCollection.prototype.cljs$core$ICounted$ = true;
HTMLCollection.prototype.cljs$core$ICounted$_count$arity$1 = (function (this$){var this$__$1 = this;return this$__$1.length;
});
HTMLCollection.prototype.cljs$core$ISeqable$ = true;
HTMLCollection.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (this$){var this$__$1 = this;return aurora.util.dom.lazy_nl_via_item.call(null,this$__$1);
});
NodeList.prototype.cljs$core$IIndexed$ = true;
NodeList.prototype.cljs$core$IIndexed$_nth$arity$2 = (function (this$,n){var this$__$1 = this;return this$__$1.item(n);
});
NodeList.prototype.cljs$core$IIndexed$_nth$arity$3 = (function (this$,n,not_found){var this$__$1 = this;var or__3357__auto__ = this$__$1.item(n);if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return not_found;
}
});
NodeList.prototype.cljs$core$ICounted$ = true;
NodeList.prototype.cljs$core$ICounted$_count$arity$1 = (function (this$){var this$__$1 = this;return this$__$1.length;
});
NodeList.prototype.cljs$core$ISeqable$ = true;
NodeList.prototype.cljs$core$ISeqable$_seq$arity$1 = (function (this$){var this$__$1 = this;return aurora.util.dom.lazy_nl_via_item.call(null,this$__$1);
});
aurora.util.dom.$$ = (function $$(query,elem){var elem__$1 = (function (){var or__3357__auto__ = elem;if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return document;
}
})();var res = elem__$1.querySelectorAll(cljs.core.name.call(null,query));return res;
});
aurora.util.dom.$ = (function $(query,elem){var elem__$1 = (function (){var or__3357__auto__ = elem;if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return document;
}
})();var res = elem__$1.querySelector(cljs.core.name.call(null,query));return res;
});
aurora.util.dom.append = (function append(parent,child){parent.appendChild(child);
return parent;
});
aurora.util.dom.add_class = (function add_class(elem,class$){if(cljs.core.truth_((function (){var and__3345__auto__ = elem;if(cljs.core.truth_(and__3345__auto__))
{return !(cljs.core.empty_QMARK_.call(null,cljs.core.name.call(null,class$)));
} else
{return and__3345__auto__;
}
})()))
{return elem.classList.add(cljs.core.name.call(null,class$));
} else
{return null;
}
});
aurora.util.dom.remove_class = (function remove_class(elem,class$){if(cljs.core.truth_((function (){var and__3345__auto__ = elem;if(cljs.core.truth_(and__3345__auto__))
{return !(cljs.core.empty_QMARK_.call(null,cljs.core.name.call(null,class$)));
} else
{return and__3345__auto__;
}
})()))
{return elem.classList.remove(cljs.core.name.call(null,class$));
} else
{return null;
}
});
aurora.util.dom.has_class_QMARK_ = (function has_class_QMARK_(elem,class$){if(cljs.core.truth_((function (){var and__3345__auto__ = elem;if(cljs.core.truth_(and__3345__auto__))
{return !(cljs.core.empty_QMARK_.call(null,cljs.core.name.call(null,class$)));
} else
{return and__3345__auto__;
}
})()))
{return elem.classList.contains(cljs.core.name.call(null,class$));
} else
{return null;
}
});
aurora.util.dom.toggle_class = (function toggle_class(elem,class$){if(cljs.core.truth_(aurora.util.dom.has_class_QMARK_.call(null,elem,class$)))
{return aurora.util.dom.remove_class.call(null,elem,class$);
} else
{return aurora.util.dom.add_class.call(null,elem,class$);
}
});
aurora.util.dom.set_css = (function set_css(elem,things){var seq__7108 = cljs.core.seq.call(null,things);var chunk__7109 = null;var count__7110 = 0;var i__7111 = 0;while(true){
if((i__7111 < count__7110))
{var vec__7112 = cljs.core._nth.call(null,chunk__7109,i__7111);var k = cljs.core.nth.call(null,vec__7112,0,null);var v = cljs.core.nth.call(null,vec__7112,1,null);(elem.style[cljs.core.name.call(null,k)] = (((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__7114 = seq__7108;
var G__7115 = chunk__7109;
var G__7116 = count__7110;
var G__7117 = (i__7111 + 1);
seq__7108 = G__7114;
chunk__7109 = G__7115;
count__7110 = G__7116;
i__7111 = G__7117;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__7108);if(temp__4092__auto__)
{var seq__7108__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__7108__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__7108__$1);{
var G__7118 = cljs.core.chunk_rest.call(null,seq__7108__$1);
var G__7119 = c__4086__auto__;
var G__7120 = cljs.core.count.call(null,c__4086__auto__);
var G__7121 = 0;
seq__7108 = G__7118;
chunk__7109 = G__7119;
count__7110 = G__7120;
i__7111 = G__7121;
continue;
}
} else
{var vec__7113 = cljs.core.first.call(null,seq__7108__$1);var k = cljs.core.nth.call(null,vec__7113,0,null);var v = cljs.core.nth.call(null,vec__7113,1,null);(elem.style[cljs.core.name.call(null,k)] = (((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__7122 = cljs.core.next.call(null,seq__7108__$1);
var G__7123 = null;
var G__7124 = 0;
var G__7125 = 0;
seq__7108 = G__7122;
chunk__7109 = G__7123;
count__7110 = G__7124;
i__7111 = G__7125;
continue;
}
}
} else
{return null;
}
}
break;
}
});
aurora.util.dom.css = (function css(elem,things){var things__$1 = ((cljs.core._EQ_.call(null,Object,cljs.core.type.call(null,things)))?cljs.core.js__GT_clj.call(null,things):things);if(cljs.core.map_QMARK_.call(null,things__$1))
{return aurora.util.dom.set_css.call(null,elem,things__$1);
} else
{return (elem.style[cljs.core.name.call(null,things__$1)]);
}
});
aurora.util.dom.set_attr = (function set_attr(elem,things){var seq__7132 = cljs.core.seq.call(null,things);var chunk__7133 = null;var count__7134 = 0;var i__7135 = 0;while(true){
if((i__7135 < count__7134))
{var vec__7136 = cljs.core._nth.call(null,chunk__7133,i__7135);var k = cljs.core.nth.call(null,vec__7136,0,null);var v = cljs.core.nth.call(null,vec__7136,1,null);elem.setAttribute(cljs.core.name.call(null,k),(((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__7138 = seq__7132;
var G__7139 = chunk__7133;
var G__7140 = count__7134;
var G__7141 = (i__7135 + 1);
seq__7132 = G__7138;
chunk__7133 = G__7139;
count__7134 = G__7140;
i__7135 = G__7141;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__7132);if(temp__4092__auto__)
{var seq__7132__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__7132__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__7132__$1);{
var G__7142 = cljs.core.chunk_rest.call(null,seq__7132__$1);
var G__7143 = c__4086__auto__;
var G__7144 = cljs.core.count.call(null,c__4086__auto__);
var G__7145 = 0;
seq__7132 = G__7142;
chunk__7133 = G__7143;
count__7134 = G__7144;
i__7135 = G__7145;
continue;
}
} else
{var vec__7137 = cljs.core.first.call(null,seq__7132__$1);var k = cljs.core.nth.call(null,vec__7137,0,null);var v = cljs.core.nth.call(null,vec__7137,1,null);elem.setAttribute(cljs.core.name.call(null,k),(((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__7146 = cljs.core.next.call(null,seq__7132__$1);
var G__7147 = null;
var G__7148 = 0;
var G__7149 = 0;
seq__7132 = G__7146;
chunk__7133 = G__7147;
count__7134 = G__7148;
i__7135 = G__7149;
continue;
}
}
} else
{return null;
}
}
break;
}
});
aurora.util.dom.attr = (function attr(elem,things){if(cljs.core.map_QMARK_.call(null,things))
{return aurora.util.dom.set_attr.call(null,elem,things);
} else
{return elem.getAttribute(cljs.core.name.call(null,things));
}
});
aurora.util.dom.parent = (function parent(elem){return elem.parentNode;
});
aurora.util.dom.children = (function children(elem){return elem.children;
});
aurora.util.dom.remove = (function remove(elem){var temp__4092__auto__ = aurora.util.dom.parent.call(null,elem);if(cljs.core.truth_(temp__4092__auto__))
{var p = temp__4092__auto__;return p.removeChild(elem);
} else
{return null;
}
});
aurora.util.dom.empty = (function empty(elem){while(true){
if(cljs.core.seq.call(null,elem.children))
{elem.removeChild((elem.children[0]));
{
continue;
}
} else
{return null;
}
break;
}
});
/**
* @param {...*} var_args
*/
aurora.util.dom.val = (function() { 
var val__delegate = function (elem,p__7150){var vec__7152 = p__7150;var v = cljs.core.nth.call(null,vec__7152,0,null);if(cljs.core.not.call(null,v))
{return elem.value;
} else
{return elem.value = v;
}
};
var val = function (elem,var_args){
var p__7150 = null;if (arguments.length > 1) {
  p__7150 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return val__delegate.call(this,elem,p__7150);};
val.cljs$lang$maxFixedArity = 1;
val.cljs$lang$applyTo = (function (arglist__7153){
var elem = cljs.core.first(arglist__7153);
var p__7150 = cljs.core.rest(arglist__7153);
return val__delegate(elem,p__7150);
});
val.cljs$core$IFn$_invoke$arity$variadic = val__delegate;
return val;
})()
;
aurora.util.dom.prevent = (function prevent(e){return e.preventDefault();
});
aurora.util.dom.stop_propagation = (function stop_propagation(e){return e.stopPropagation();
});
aurora.util.dom.siblings = (function siblings(elem){return aurora.util.dom.parent.call(null,elem).children;
});
aurora.util.dom.parents = (function parents(elem,sel){var root = aurora.util.dom.parent.call(null,aurora.util.dom.$.call(null,new cljs.core.Keyword(null,"body","body",1016933652)));var p = aurora.util.dom.parent.call(null,elem);while(true){
if(cljs.core.truth_((function (){var and__3345__auto__ = p;if(cljs.core.truth_(and__3345__auto__))
{return cljs.core.not_EQ_.call(null,p,root);
} else
{return and__3345__auto__;
}
})()))
{if(cljs.core.truth_(p.webkitMatchesSelector(cljs.core.name.call(null,sel))))
{return p;
} else
{{
var G__7154 = aurora.util.dom.parent.call(null,p);
p = G__7154;
continue;
}
}
} else
{return null;
}
break;
}
});
aurora.util.dom.next = (function next(elem){return elem.nextElementSibling;
});
aurora.util.dom.before = (function before(elem,neue){return aurora.util.dom.parent.call(null,elem).insertBefore(neue,elem);
});
aurora.util.dom.after = (function after(elem,neue){var temp__4090__auto__ = aurora.util.dom.next.call(null,elem);if(cljs.core.truth_(temp__4090__auto__))
{var n = temp__4090__auto__;return aurora.util.dom.before.call(null,n,neue);
} else
{return aurora.util.dom.append.call(null,aurora.util.dom.parent.call(null,elem),neue);
}
});
aurora.util.dom.replace_with = (function replace_with(orig,neue){var temp__4092__auto__ = aurora.util.dom.parent.call(null,orig);if(cljs.core.truth_(temp__4092__auto__))
{var p = temp__4092__auto__;return p.replaceChild(neue,orig);
} else
{return null;
}
});
aurora.util.dom.height = (function height(elem){return elem.clientHeight;
});
aurora.util.dom.width = (function width(elem){return elem.clientWidth;
});
aurora.util.dom.offset_top = (function offset_top(elem){return elem.offsetTop;
});
/**
* @param {...*} var_args
*/
aurora.util.dom.scroll_top = (function() { 
var scroll_top__delegate = function (elem,p__7155){var vec__7157 = p__7155;var v = cljs.core.nth.call(null,vec__7157,0,null);if(cljs.core.not.call(null,v))
{return elem.scrollTop;
} else
{return elem.scrollTop = v;
}
};
var scroll_top = function (elem,var_args){
var p__7155 = null;if (arguments.length > 1) {
  p__7155 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return scroll_top__delegate.call(this,elem,p__7155);};
scroll_top.cljs$lang$maxFixedArity = 1;
scroll_top.cljs$lang$applyTo = (function (arglist__7158){
var elem = cljs.core.first(arglist__7158);
var p__7155 = cljs.core.rest(arglist__7158);
return scroll_top__delegate(elem,p__7155);
});
scroll_top.cljs$core$IFn$_invoke$arity$variadic = scroll_top__delegate;
return scroll_top;
})()
;
aurora.util.dom.top = (function top(elem){return aurora.util.dom.css.call(null,elem,new cljs.core.Keyword(null,"top","top",1014019271));
});
aurora.util.dom.bottom = (function bottom(elem){return aurora.util.dom.css.call(null,elem,new cljs.core.Keyword(null,"bottom","bottom",3925642653));
});
aurora.util.dom.left = (function left(elem){return aurora.util.dom.css.call(null,elem,new cljs.core.Keyword(null,"left","left",1017222009));
});
aurora.util.dom.right = (function right(elem){return aurora.util.dom.css.call(null,elem,new cljs.core.Keyword(null,"right","right",1122416014));
});
/**
* @param {...*} var_args
*/
aurora.util.dom.html = (function() { 
var html__delegate = function (elem,p__7159){var vec__7161 = p__7159;var h = cljs.core.nth.call(null,vec__7161,0,null);if(cljs.core.not.call(null,h))
{return elem.innerHTML;
} else
{return elem.innerHTML = h;
}
};
var html = function (elem,var_args){
var p__7159 = null;if (arguments.length > 1) {
  p__7159 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return html__delegate.call(this,elem,p__7159);};
html.cljs$lang$maxFixedArity = 1;
html.cljs$lang$applyTo = (function (arglist__7162){
var elem = cljs.core.first(arglist__7162);
var p__7159 = cljs.core.rest(arglist__7162);
return html__delegate(elem,p__7159);
});
html.cljs$core$IFn$_invoke$arity$variadic = html__delegate;
return html;
})()
;
aurora.util.dom.__GT_ev = (function __GT_ev(ev){return [cljs.core.str(cljs.core.name.call(null,ev))].join('');
});
/**
* @param {...*} var_args
*/
aurora.util.dom.trigger = (function() { 
var trigger__delegate = function (elem,ev,p__7163){var vec__7165 = p__7163;var opts = cljs.core.nth.call(null,vec__7165,0,null);var e = document.createEvent("HTMLEvents");e.initEvent(cljs.core.name.call(null,ev),true,true);
e.opts = opts;
return elem.dispatchEvent(e);
};
var trigger = function (elem,ev,var_args){
var p__7163 = null;if (arguments.length > 2) {
  p__7163 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 2),0);} 
return trigger__delegate.call(this,elem,ev,p__7163);};
trigger.cljs$lang$maxFixedArity = 2;
trigger.cljs$lang$applyTo = (function (arglist__7166){
var elem = cljs.core.first(arglist__7166);
arglist__7166 = cljs.core.next(arglist__7166);
var ev = cljs.core.first(arglist__7166);
var p__7163 = cljs.core.rest(arglist__7166);
return trigger__delegate(elem,ev,p__7163);
});
trigger.cljs$core$IFn$_invoke$arity$variadic = trigger__delegate;
return trigger;
})()
;
aurora.util.dom.on = (function on(elem,ev,cb){return elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
});
aurora.util.dom.off = (function off(elem,ev,cb){return elem.removeEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
});
aurora.util.dom.on_STAR_ = (function on_STAR_(elem,evs){var seq__7173 = cljs.core.seq.call(null,evs);var chunk__7174 = null;var count__7175 = 0;var i__7176 = 0;while(true){
if((i__7176 < count__7175))
{var vec__7177 = cljs.core._nth.call(null,chunk__7174,i__7176);var ev = cljs.core.nth.call(null,vec__7177,0,null);var cb = cljs.core.nth.call(null,vec__7177,1,null);elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
{
var G__7179 = seq__7173;
var G__7180 = chunk__7174;
var G__7181 = count__7175;
var G__7182 = (i__7176 + 1);
seq__7173 = G__7179;
chunk__7174 = G__7180;
count__7175 = G__7181;
i__7176 = G__7182;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__7173);if(temp__4092__auto__)
{var seq__7173__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__7173__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__7173__$1);{
var G__7183 = cljs.core.chunk_rest.call(null,seq__7173__$1);
var G__7184 = c__4086__auto__;
var G__7185 = cljs.core.count.call(null,c__4086__auto__);
var G__7186 = 0;
seq__7173 = G__7183;
chunk__7174 = G__7184;
count__7175 = G__7185;
i__7176 = G__7186;
continue;
}
} else
{var vec__7178 = cljs.core.first.call(null,seq__7173__$1);var ev = cljs.core.nth.call(null,vec__7178,0,null);var cb = cljs.core.nth.call(null,vec__7178,1,null);elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
{
var G__7187 = cljs.core.next.call(null,seq__7173__$1);
var G__7188 = null;
var G__7189 = 0;
var G__7190 = 0;
seq__7173 = G__7187;
chunk__7174 = G__7188;
count__7175 = G__7189;
i__7176 = G__7190;
continue;
}
}
} else
{return null;
}
}
break;
}
});
aurora.util.dom.active_element = (function active_element(){return document.activeElement;
});
aurora.util.dom.focus = (function focus(elem){return elem.focus();
});
aurora.util.dom.blur = (function blur(elem){return elem.blur();
});
aurora.util.dom.selection = (function selection(elem,start,stop,dir){return elem.setSelectionRange(start,stop,dir);
});
aurora.util.dom.make = (function make(str){var d = document.createElement("div");aurora.util.dom.html.call(null,d,str);
return aurora.util.dom.children.call(null,d);
});
aurora.util.dom.index = (function index(e){var p = aurora.util.dom.parent.call(null,e);var c = (cljs.core.truth_(p)?aurora.util.dom.children.call(null,p):[]);var len = c.length;if(cljs.core.not.call(null,p))
{return -1;
} else
{var i = 0;while(true){
if((i >= len))
{return null;
} else
{if(cljs.core._EQ_.call(null,(c[i]),e))
{return i;
} else
{{
var G__7191 = (i + 1);
i = G__7191;
continue;
}
}
}
break;
}
}
});
aurora.util.dom.ready = (function ready(func){return aurora.util.dom.on.call(null,document,new cljs.core.Keyword(null,"DOMContentLoaded","DOMContentLoaded",3783578446),func);
});
