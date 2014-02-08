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
aurora.util.dom.set_css = (function set_css(elem,things){var seq__10494 = cljs.core.seq.call(null,things);var chunk__10495 = null;var count__10496 = 0;var i__10497 = 0;while(true){
if((i__10497 < count__10496))
{var vec__10498 = cljs.core._nth.call(null,chunk__10495,i__10497);var k = cljs.core.nth.call(null,vec__10498,0,null);var v = cljs.core.nth.call(null,vec__10498,1,null);(elem.style[cljs.core.name.call(null,k)] = (((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__10500 = seq__10494;
var G__10501 = chunk__10495;
var G__10502 = count__10496;
var G__10503 = (i__10497 + 1);
seq__10494 = G__10500;
chunk__10495 = G__10501;
count__10496 = G__10502;
i__10497 = G__10503;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__10494);if(temp__4092__auto__)
{var seq__10494__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__10494__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__10494__$1);{
var G__10504 = cljs.core.chunk_rest.call(null,seq__10494__$1);
var G__10505 = c__4086__auto__;
var G__10506 = cljs.core.count.call(null,c__4086__auto__);
var G__10507 = 0;
seq__10494 = G__10504;
chunk__10495 = G__10505;
count__10496 = G__10506;
i__10497 = G__10507;
continue;
}
} else
{var vec__10499 = cljs.core.first.call(null,seq__10494__$1);var k = cljs.core.nth.call(null,vec__10499,0,null);var v = cljs.core.nth.call(null,vec__10499,1,null);(elem.style[cljs.core.name.call(null,k)] = (((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__10508 = cljs.core.next.call(null,seq__10494__$1);
var G__10509 = null;
var G__10510 = 0;
var G__10511 = 0;
seq__10494 = G__10508;
chunk__10495 = G__10509;
count__10496 = G__10510;
i__10497 = G__10511;
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
aurora.util.dom.set_attr = (function set_attr(elem,things){var seq__10518 = cljs.core.seq.call(null,things);var chunk__10519 = null;var count__10520 = 0;var i__10521 = 0;while(true){
if((i__10521 < count__10520))
{var vec__10522 = cljs.core._nth.call(null,chunk__10519,i__10521);var k = cljs.core.nth.call(null,vec__10522,0,null);var v = cljs.core.nth.call(null,vec__10522,1,null);elem.setAttribute(cljs.core.name.call(null,k),(((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__10524 = seq__10518;
var G__10525 = chunk__10519;
var G__10526 = count__10520;
var G__10527 = (i__10521 + 1);
seq__10518 = G__10524;
chunk__10519 = G__10525;
count__10520 = G__10526;
i__10521 = G__10527;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__10518);if(temp__4092__auto__)
{var seq__10518__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__10518__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__10518__$1);{
var G__10528 = cljs.core.chunk_rest.call(null,seq__10518__$1);
var G__10529 = c__4086__auto__;
var G__10530 = cljs.core.count.call(null,c__4086__auto__);
var G__10531 = 0;
seq__10518 = G__10528;
chunk__10519 = G__10529;
count__10520 = G__10530;
i__10521 = G__10531;
continue;
}
} else
{var vec__10523 = cljs.core.first.call(null,seq__10518__$1);var k = cljs.core.nth.call(null,vec__10523,0,null);var v = cljs.core.nth.call(null,vec__10523,1,null);elem.setAttribute(cljs.core.name.call(null,k),(((v instanceof cljs.core.Keyword))?cljs.core.name.call(null,v):v));
{
var G__10532 = cljs.core.next.call(null,seq__10518__$1);
var G__10533 = null;
var G__10534 = 0;
var G__10535 = 0;
seq__10518 = G__10532;
chunk__10519 = G__10533;
count__10520 = G__10534;
i__10521 = G__10535;
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
var val__delegate = function (elem,p__10536){var vec__10538 = p__10536;var v = cljs.core.nth.call(null,vec__10538,0,null);if(cljs.core.not.call(null,v))
{return elem.value;
} else
{return elem.value = v;
}
};
var val = function (elem,var_args){
var p__10536 = null;if (arguments.length > 1) {
  p__10536 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return val__delegate.call(this,elem,p__10536);};
val.cljs$lang$maxFixedArity = 1;
val.cljs$lang$applyTo = (function (arglist__10539){
var elem = cljs.core.first(arglist__10539);
var p__10536 = cljs.core.rest(arglist__10539);
return val__delegate(elem,p__10536);
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
var G__10540 = aurora.util.dom.parent.call(null,p);
p = G__10540;
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
var scroll_top__delegate = function (elem,p__10541){var vec__10543 = p__10541;var v = cljs.core.nth.call(null,vec__10543,0,null);if(cljs.core.not.call(null,v))
{return elem.scrollTop;
} else
{return elem.scrollTop = v;
}
};
var scroll_top = function (elem,var_args){
var p__10541 = null;if (arguments.length > 1) {
  p__10541 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return scroll_top__delegate.call(this,elem,p__10541);};
scroll_top.cljs$lang$maxFixedArity = 1;
scroll_top.cljs$lang$applyTo = (function (arglist__10544){
var elem = cljs.core.first(arglist__10544);
var p__10541 = cljs.core.rest(arglist__10544);
return scroll_top__delegate(elem,p__10541);
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
var html__delegate = function (elem,p__10545){var vec__10547 = p__10545;var h = cljs.core.nth.call(null,vec__10547,0,null);if(cljs.core.not.call(null,h))
{return elem.innerHTML;
} else
{return elem.innerHTML = h;
}
};
var html = function (elem,var_args){
var p__10545 = null;if (arguments.length > 1) {
  p__10545 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 1),0);} 
return html__delegate.call(this,elem,p__10545);};
html.cljs$lang$maxFixedArity = 1;
html.cljs$lang$applyTo = (function (arglist__10548){
var elem = cljs.core.first(arglist__10548);
var p__10545 = cljs.core.rest(arglist__10548);
return html__delegate(elem,p__10545);
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
var trigger__delegate = function (elem,ev,p__10549){var vec__10551 = p__10549;var opts = cljs.core.nth.call(null,vec__10551,0,null);var e = document.createEvent("HTMLEvents");e.initEvent(cljs.core.name.call(null,ev),true,true);
e.opts = opts;
return elem.dispatchEvent(e);
};
var trigger = function (elem,ev,var_args){
var p__10549 = null;if (arguments.length > 2) {
  p__10549 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 2),0);} 
return trigger__delegate.call(this,elem,ev,p__10549);};
trigger.cljs$lang$maxFixedArity = 2;
trigger.cljs$lang$applyTo = (function (arglist__10552){
var elem = cljs.core.first(arglist__10552);
arglist__10552 = cljs.core.next(arglist__10552);
var ev = cljs.core.first(arglist__10552);
var p__10549 = cljs.core.rest(arglist__10552);
return trigger__delegate(elem,ev,p__10549);
});
trigger.cljs$core$IFn$_invoke$arity$variadic = trigger__delegate;
return trigger;
})()
;
aurora.util.dom.on = (function on(elem,ev,cb){return elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
});
aurora.util.dom.off = (function off(elem,ev,cb){return elem.removeEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
});
aurora.util.dom.on_STAR_ = (function on_STAR_(elem,evs){var seq__10559 = cljs.core.seq.call(null,evs);var chunk__10560 = null;var count__10561 = 0;var i__10562 = 0;while(true){
if((i__10562 < count__10561))
{var vec__10563 = cljs.core._nth.call(null,chunk__10560,i__10562);var ev = cljs.core.nth.call(null,vec__10563,0,null);var cb = cljs.core.nth.call(null,vec__10563,1,null);elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
{
var G__10565 = seq__10559;
var G__10566 = chunk__10560;
var G__10567 = count__10561;
var G__10568 = (i__10562 + 1);
seq__10559 = G__10565;
chunk__10560 = G__10566;
count__10561 = G__10567;
i__10562 = G__10568;
continue;
}
} else
{var temp__4092__auto__ = cljs.core.seq.call(null,seq__10559);if(temp__4092__auto__)
{var seq__10559__$1 = temp__4092__auto__;if(cljs.core.chunked_seq_QMARK_.call(null,seq__10559__$1))
{var c__4086__auto__ = cljs.core.chunk_first.call(null,seq__10559__$1);{
var G__10569 = cljs.core.chunk_rest.call(null,seq__10559__$1);
var G__10570 = c__4086__auto__;
var G__10571 = cljs.core.count.call(null,c__4086__auto__);
var G__10572 = 0;
seq__10559 = G__10569;
chunk__10560 = G__10570;
count__10561 = G__10571;
i__10562 = G__10572;
continue;
}
} else
{var vec__10564 = cljs.core.first.call(null,seq__10559__$1);var ev = cljs.core.nth.call(null,vec__10564,0,null);var cb = cljs.core.nth.call(null,vec__10564,1,null);elem.addEventListener(aurora.util.dom.__GT_ev.call(null,ev),cb);
{
var G__10573 = cljs.core.next.call(null,seq__10559__$1);
var G__10574 = null;
var G__10575 = 0;
var G__10576 = 0;
seq__10559 = G__10573;
chunk__10560 = G__10574;
count__10561 = G__10575;
i__10562 = G__10576;
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
var G__10577 = (i + 1);
i = G__10577;
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
