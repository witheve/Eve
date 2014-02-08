// Compiled by ClojureScript .
goog.provide('aurora.editor.ui');
goog.require('cljs.core');
goog.require('aurora.editor.core');
goog.require('aurora.editor.cursors');
goog.require('aurora.runtime.table');
goog.require('aurora.compiler.jsth');
goog.require('aurora.util.dom');
goog.require('aurora.editor.core');
goog.require('aurora.editor.cursors');
goog.require('aurora.runtime.table');
goog.require('cljs.reader');
goog.require('aurora.util.dom');
goog.require('aurora.compiler.jsth');
goog.require('cljs.reader');
goog.require('aurora.compiler.ast');
goog.require('aurora.compiler.compiler');
goog.require('aurora.compiler.ast');
goog.require('aurora.compiler.compiler');
aurora.editor.ui.now = (function now(){return (new Date()).getTime();
});
(cljs.core.IMeta["function"] = true);
(cljs.core._meta["function"] = (function (this$){return this$.meta;
}));
(cljs.core.Fn["function"] = true);
cljs.core.alter_meta_BANG_.call(null,cljs.core._PLUS_,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"Add ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core._PLUS_");
cljs.core.alter_meta_BANG_.call(null,cljs.core._,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"Subtract ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core._");
cljs.core.alter_meta_BANG_.call(null,cljs.core._STAR_,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"Multiply ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core._STAR_");
cljs.core.alter_meta_BANG_.call(null,cljs.core._SLASH_,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"Divide ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core._SLASH_");
cljs.core.alter_meta_BANG_.call(null,cljs.core.number_QMARK_,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"Is a number? ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core.number_QMARK_");
cljs.core.alter_meta_BANG_.call(null,cljs.core.mapv,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),"each ",new cljs.core.Keyword(null,"name","name",1017277949),"cljs.core.mapv");
aurora.editor.ui.stack__GT_cursor = (function stack__GT_cursor(stack,type){if(cljs.core.truth_(stack))
{return aurora.editor.cursors.cursor.call(null,cljs.core.second.call(null,cljs.core.first.call(null,cljs.core.filter.call(null,(function (p1__6485_SHARP_){return cljs.core._EQ_.call(null,cljs.core.first.call(null,p1__6485_SHARP_),type);
}),stack))));
} else
{return null;
}
});
aurora.editor.ui.push = (function push(stack,thing){if(cljs.core.truth_(stack))
{return cljs.core.conj.call(null,stack,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [(function (){var pred__6489 = cljs.core._EQ_;var expr__6490 = new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,thing));if(cljs.core.truth_(pred__6489.call(null,new cljs.core.Keyword(null,"page","page",1017337345),expr__6490)))
{return new cljs.core.Keyword(null,"page","page",1017337345);
} else
{if(cljs.core.truth_(pred__6489.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429),expr__6490)))
{return new cljs.core.Keyword(null,"notebook","notebook",2595460429);
} else
{return new cljs.core.Keyword(null,"step","step",1017444926);
}
}
})(),aurora.editor.cursors.cursor__GT_id.call(null,thing)], null));
} else
{return null;
}
});
aurora.editor.ui.set_stack_BANG_ = (function set_stack_BANG_(stack){if(cljs.core.truth_(stack))
{return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc,new cljs.core.Keyword(null,"stack","stack",1123661306),stack);
} else
{return null;
}
});
aurora.editor.ui.current_stack_QMARK_ = (function current_stack_QMARK_(stack){if(cljs.core.truth_(stack))
{return cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"stack","stack",1123661306).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)),stack);
} else
{return null;
}
});
aurora.editor.ui.step_list_item = (function (){var method_table__4195__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var prefer_table__4196__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var method_cache__4197__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var cached_hierarchy__4198__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var hierarchy__4199__auto__ = cljs.core.get.call(null,cljs.core.PersistentArrayMap.EMPTY,new cljs.core.Keyword(null,"hierarchy","hierarchy",3129050535),cljs.core.get_global_hierarchy.call(null));return (new cljs.core.MultiFn("step-list-item",(function (p1__6492_SHARP_){return new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,p1__6492_SHARP_));
}),new cljs.core.Keyword(null,"default","default",2558708147),hierarchy__4199__auto__,method_table__4195__auto__,prefer_table__4196__auto__,method_cache__4197__auto__,cached_hierarchy__4198__auto__));
})();
aurora.editor.ui.step_description = (function (){var method_table__4195__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var prefer_table__4196__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var method_cache__4197__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var cached_hierarchy__4198__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var hierarchy__4199__auto__ = cljs.core.get.call(null,cljs.core.PersistentArrayMap.EMPTY,new cljs.core.Keyword(null,"hierarchy","hierarchy",3129050535),cljs.core.get_global_hierarchy.call(null));return (new cljs.core.MultiFn("step-description",(function (p1__6493_SHARP_){return new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,p1__6493_SHARP_));
}),new cljs.core.Keyword(null,"default","default",2558708147),hierarchy__4199__auto__,method_table__4195__auto__,prefer_table__4196__auto__,method_cache__4197__auto__,cached_hierarchy__4198__auto__));
})();
aurora.editor.ui.item_ui = (function (){var method_table__4195__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var prefer_table__4196__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var method_cache__4197__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var cached_hierarchy__4198__auto__ = cljs.core.atom.call(null,cljs.core.PersistentArrayMap.EMPTY);var hierarchy__4199__auto__ = cljs.core.get.call(null,cljs.core.PersistentArrayMap.EMPTY,new cljs.core.Keyword(null,"hierarchy","hierarchy",3129050535),cljs.core.get_global_hierarchy.call(null));return (new cljs.core.MultiFn("item-ui",(function (p1__6494_SHARP_){return new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,p1__6494_SHARP_));
}),new cljs.core.Keyword(null,"default","default",2558708147),hierarchy__4199__auto__,method_table__4195__auto__,prefer_table__4196__auto__,method_cache__4197__auto__,cached_hierarchy__4198__auto__));
})();
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword(null,"default","default",2558708147),(function (node,stack){var temp__4090__auto__ = aurora.editor.ui.__GT_rep.call(null,cljs.core.deref.call(null,node));if(cljs.core.truth_(temp__4090__auto__))
{var rep = temp__4090__auto__;return rep.call(null,node,stack);
} else
{return React.DOM.span.call(null,null,[cljs.core.pr_str.call(null,aurora.editor.ui.x)]);
}
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_list_item,new cljs.core.Keyword(null,"default","default",2558708147),(function (step,stack){var temp__4090__auto__ = aurora.editor.ui.__GT_rep.call(null,cljs.core.deref.call(null,step));if(cljs.core.truth_(temp__4090__auto__))
{var rep = temp__4090__auto__;return rep.call(null,step,stack);
} else
{return React.DOM.p.call(null,null,["this is a step list item of ",cljs.core.pr_str.call(null,cljs.core.deref.call(null,step))]);
}
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_description,new cljs.core.Keyword(null,"default","default",2558708147),(function (step){return React.DOM.p.call(null,null,["this is a step description of ",cljs.core.pr_str.call(null,cljs.core.deref.call(null,step))]);
}));
aurora.editor.ui.sub_step = (function sub_step(step,stack){var temp__4092__auto__ = aurora.editor.ui.from_cache.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"open-paths","open-paths",4565364509),stack], null));if(cljs.core.truth_(temp__4092__auto__))
{var id = temp__4092__auto__;return React.DOM.div.call(null,(function (){var obj6500 = {"className":"substep"};return obj6500;
})(),[(function (){var page = aurora.editor.cursors.cursor.call(null,id);if(cljs.core.truth_(page))
{return aurora.editor.ui.steps_list.call(null,page,aurora.editor.ui.push.call(null,stack,page));
} else
{return React.DOM.span.call(null,(function (){var obj6502 = {"className":"native"};return obj6502;
})(),["Native method"]);
}
})()]);
} else
{return null;
}
});
aurora.editor.ui.recursed = false;
aurora.editor.ui.page_steps = (function page_steps(page,stack){return React.DOM.ul.call(null,(function (){var obj6525 = {"className":"steps"};return obj6525;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,aurora.editor.cursors.cursors.call(null,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6545 = 0;var step_6546 = (xs__4750__auto__[0]);while(true){
if((index_6545 < xs_count__4751__auto__))
{res_sym.push((function (){var error_QMARK_ = cljs.core._EQ_.call(null,aurora.editor.ui.from_cache.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"error","error",1110689146),new cljs.core.Keyword(null,"stack","stack",1123661306)], null)),aurora.editor.ui.push.call(null,stack,step_6546));return React.DOM.li.call(null,(function (){var obj6528 = {"className":[cljs.core.str("step-container"),cljs.core.str(((error_QMARK_)?" error":null))].join('')};return obj6528;
})(),[React.DOM.div.call(null,(function (){var obj6530 = {"className":"step-row"};return obj6530;
})(),[React.DOM.div.call(null,(function (){var obj6532 = {"className":"step-id-container"};return obj6532;
})(),[React.DOM.span.call(null,(function (){var obj6534 = {"className":"step-id"};return obj6534;
})(),[(index_6545 + 1)])]),aurora.editor.ui.step_list_item.call(null,step_6546,aurora.editor.ui.push.call(null,stack,step_6546))]),((error_QMARK_)?React.DOM.div.call(null,(function (){var obj6536 = {"className":"step-error"};return obj6536;
})(),[((cljs.core._EQ_.call(null,"MatchFailure!",aurora.editor.ui.from_cache.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"error","error",1110689146),new cljs.core.Keyword(null,"exception","exception",2495529921)], null))))?"No branch matches the given input":cljs.core.pr_str.call(null,aurora.editor.ui.from_cache.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"error","error",1110689146),new cljs.core.Keyword(null,"exception","exception",2495529921)], null))))]):null),aurora.editor.ui.sub_step.call(null,step_6546,aurora.editor.ui.push.call(null,stack,step_6546))]);
})());
{
var G__6547 = (index_6545 + 1);
var G__6548 = (xs__4750__auto__[(index_6545 + 1)]);
index_6545 = G__6547;
step_6546 = G__6548;
continue;
}
} else
{}
break;
}
return res_sym;
})(),React.DOM.li.call(null,(function (){var obj6538 = {"className":"step-container"};return obj6538;
})(),[React.DOM.div.call(null,(function (){var obj6540 = {"className":"step-row"};return obj6540;
})(),[React.DOM.div.call(null,(function (){var obj6542 = {"className":"step-id-container"};return obj6542;
})(),[React.DOM.span.call(null,(function (){var obj6544 = {"className":"step-id"};return obj6544;
})(),["N"])]),aurora.editor.ui.new_step_helper.call(null,page,stack)])])]);
});
aurora.editor.ui.knowledge_container = (function knowledge_container(page,stack){return React.DOM.div.call(null,(function (){var obj6561 = {"className":"knowledge step-row"};return obj6561;
})(),[React.DOM.div.call(null,(function (){var obj6563 = {"className":"step-id-container"};return obj6563;
})(),[React.DOM.span.call(null,(function (){var obj6565 = {"className":"step-id"};return obj6565;
})(),["K"])]),React.DOM.div.call(null,(function (){var obj6567 = {"className":"step"};return obj6567;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6571 = 0;var arg_6572 = (xs__4750__auto__[0]);while(true){
if((index_6571 < xs_count__4751__auto__))
{res_sym.push(React.DOM.div.call(null,(function (){var obj6570 = {"className":"arg"};return obj6570;
})(),[aurora.editor.ui.item_ui.call(null,aurora.editor.cursors.value_cursor.call(null,new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),arg_6572], null)),stack)]));
{
var G__6573 = (index_6571 + 1);
var G__6574 = (xs__4750__auto__[(index_6571 + 1)]);
index_6571 = G__6573;
arg_6572 = G__6574;
continue;
}
} else
{}
break;
}
return res_sym;
})()])]);
});
aurora.editor.ui.steps_list = (function steps_list(page,stack){return React.DOM.div.call(null,(function (){var obj6580 = {"className":"workspace"};return obj6580;
})(),[React.DOM.div.call(null,(function (){var obj6582 = {"className":"steps-container"};return obj6582;
})(),[aurora.editor.ui.knowledge_container.call(null,page,stack),aurora.editor.ui.page_steps.call(null,page,stack)])]);
});
aurora.editor.ui.step_click = (function step_click(stack){return (function (e){e.preventDefault();
return e.stopPropagation();
});
});
aurora.editor.ui.step_class = (function step_class(stack){return [cljs.core.str("step "),cljs.core.str((cljs.core.truth_(aurora.editor.ui.current_stack_QMARK_.call(null,stack))?"selected":null))].join('');
});
aurora.editor.ui.clickable_ref = (function clickable_ref(step,stack){var ref = new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step));var name = aurora.editor.ui.ref__GT_name.call(null,ref);var dblclick = ((function (ref,name){
return (function (){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.update_in,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"open-paths","open-paths",4565364509),stack], null),((function (ref,name){
return (function (p1__6583_SHARP_){if(cljs.core.not.call(null,p1__6583_SHARP_))
{return new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(ref);
} else
{return null;
}
});})(ref,name))
);
});})(ref,name))
;return React.DOM.p.call(null,(function (){var obj6588 = {"className":"desc","onDoubleClick":dblclick};return obj6588;
})(),[name,(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6590 = 0;var input_6591 = (xs__4750__auto__[0]);while(true){
if((index_6590 < xs_count__4751__auto__))
{res_sym.push(aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"args","args",1016906831),index_6590], null)),stack));
{
var G__6592 = (index_6590 + 1);
var G__6593 = (xs__4750__auto__[(index_6590 + 1)]);
index_6590 = G__6592;
input_6591 = G__6593;
continue;
}
} else
{}
break;
}
return res_sym;
})()]);
});
cljs.core._add_method.call(null,aurora.editor.ui.step_list_item,new cljs.core.Keyword(null,"call","call",1016950224),(function (step,stack){return React.DOM.div.call(null,(function (){var obj6596 = {"className":aurora.editor.ui.step_class.call(null,stack),"onClick":aurora.editor.ui.step_click.call(null,stack),"onContextMenu":(function (p1__6594_SHARP_){return aurora.editor.ui.show_menu_BANG_.call(null,p1__6594_SHARP_,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"remove step",new cljs.core.Keyword(null,"action","action",3885920680),(function (){return aurora.editor.ui.remove_step_BANG_.call(null,aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"page","page",1017337345)),step);
})], null)], null));
})};return obj6596;
})(),[aurora.editor.ui.clickable_ref.call(null,step,stack),React.DOM.div.call(null,(function (){var obj6598 = {"className":"result"};return obj6598;
})(),[aurora.editor.ui.item_ui.call(null,aurora.editor.cursors.value_cursor.call(null,aurora.editor.ui.path__GT_result.call(null,stack)))])]);
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_description,new cljs.core.Keyword(null,"call","call",1016950224),(function (step,stack){return [React.DOM.p.call(null,(function (){var obj6600 = {"className":"desc"};return obj6600;
})(),[aurora.editor.ui.ref__GT_name.call(null,new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step))),(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6604 = 0;var input_6605 = (xs__4750__auto__[0]);while(true){
if((index_6604 < xs_count__4751__auto__))
{res_sym.push(aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"args","args",1016906831),index_6604], null)),stack));
{
var G__6606 = (index_6604 + 1);
var G__6607 = (xs__4750__auto__[(index_6604 + 1)]);
index_6604 = G__6606;
input_6605 = G__6607;
continue;
}
} else
{}
break;
}
return res_sym;
})()]),React.DOM.div.call(null,(function (){var obj6603 = {"className":"result"};return obj6603;
})(),[aurora.editor.ui.item_ui.call(null,aurora.editor.cursors.value_cursor.call(null,aurora.editor.ui.path__GT_result.call(null,stack)))])];
}));
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword(null,"call","call",1016950224),(function (step){return React.DOM.p.call(null,(function (){var obj6609 = {"className":"desc"};return obj6609;
})(),[aurora.editor.ui.ref__GT_name.call(null,new cljs.core.Keyword(null,"ref","ref",1014017029).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step))),(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6611 = 0;var input_6612 = (xs__4750__auto__[0]);while(true){
if((index_6611 < xs_count__4751__auto__))
{res_sym.push(aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"args","args",1016906831),index_6611], null))));
{
var G__6613 = (index_6611 + 1);
var G__6614 = (xs__4750__auto__[(index_6611 + 1)]);
index_6611 = G__6613;
input_6612 = G__6614;
continue;
}
} else
{}
break;
}
return res_sym;
})()]);
}));
aurora.editor.ui.branch_result = (function branch_result(branch,stack){if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(new cljs.core.Keyword(null,"node","node",1017291124).cljs$core$IFn$_invoke$arity$1(branch)),new cljs.core.Keyword(null,"ref","ref",1014017029)))
{return aurora.editor.ui.clickable_ref.call(null,branch,stack);
} else
{return aurora.editor.ui.item_ui.call(null,new cljs.core.Keyword(null,"node","node",1017291124).cljs$core$IFn$_invoke$arity$1(branch));
}
});
cljs.core._add_method.call(null,aurora.editor.ui.step_list_item,new cljs.core.Keyword(null,"match","match",1117572407),(function (step,stack){var matched_branch = aurora.editor.ui.path__GT_match_branch.call(null,stack);return React.DOM.div.call(null,(function (){var obj6617 = {"className":aurora.editor.ui.step_class.call(null,stack),"onClick":aurora.editor.ui.step_click.call(null,stack),"onContextMenu":(function (p1__6615_SHARP_){return aurora.editor.ui.show_menu_BANG_.call(null,p1__6615_SHARP_,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"remove step",new cljs.core.Keyword(null,"action","action",3885920680),(function (){return aurora.editor.ui.remove_step_BANG_.call(null,aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"page","page",1017337345)),step);
})], null)], null));
})};return obj6617;
})(),[React.DOM.div.call(null,(function (){var obj6619 = {"className":"desc"};return obj6619;
})(),["Match",aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.Keyword(null,"arg","arg",1014001096)),stack,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"name-only?","name-only?",3468362691),true], null)),"against"]),React.DOM.ul.call(null,(function (){var obj6621 = {"className":"match-list"};return obj6621;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"branches","branches",988497218).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6629 = 0;var branch_6630 = (xs__4750__auto__[0]);while(true){
if((index_6629 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,(function (){var obj6624 = {"className":[cljs.core.str("match-branch"),cljs.core.str(((cljs.core._EQ_.call(null,matched_branch,index_6629))?" active":null))].join('')};return obj6624;
})(),[React.DOM.span.call(null,null,[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"branches","branches",988497218),index_6629,new cljs.core.Keyword(null,"pattern","pattern",4517781250)], null)),stack)]),React.DOM.span.call(null,(function (){var obj6626 = {"className":"match-action"};return obj6626;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"branches","branches",988497218),index_6629,new cljs.core.Keyword(null,"action","action",3885920680)], null)),stack)])]));
{
var G__6631 = (index_6629 + 1);
var G__6632 = (xs__4750__auto__[(index_6629 + 1)]);
index_6629 = G__6631;
branch_6630 = G__6632;
continue;
}
} else
{}
break;
}
return res_sym;
})()]),React.DOM.button.call(null,(function (){var obj6628 = {"className":"add-match-branch","onClick":(function (){return aurora.editor.cursors.swap_BANG_.call(null,step,cljs.core.update_in,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"branches","branches",988497218)], null),cljs.core.conj,aurora.editor.ui.match_branch.call(null));
})};return obj6628;
})(),[""])]);
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_description,new cljs.core.Keyword(null,"match","match",1117572407),(function (step,stack){return React.DOM.p.call(null,(function (){var obj6634 = {"className":"desc"};return obj6634;
})(),["Find a match for ",aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.Keyword(null,"arg","arg",1014001096)))]);
}));
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword("match","bind","match/bind",3414283803),(function (x,stack){return React.DOM.span.call(null,(function (){var obj6636 = {"className":"ref"};return obj6636;
})(),[new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,x))]);
}));
aurora.editor.ui.datatype_name = (function datatype_name(x){if((x == null))
{return "string";
} else
{if(cljs.core.truth_(new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword("ref","id","ref/id",1021254372),null,new cljs.core.Keyword("ref","js","ref/js",1021254446),null], null), null).call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x))))
{return "ref";
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"math","math",1017248378),new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(x)))
{return "math";
} else
{if((x === true) || (x === false))
{return "boolean";
} else
{if((x instanceof cljs.core.Keyword))
{return "keyword";
} else
{if(typeof x === 'number')
{return "number";
} else
{if(typeof x === 'string')
{return "string";
} else
{if(cljs.core.map_QMARK_.call(null,x))
{return "map";
} else
{if(cljs.core.vector_QMARK_.call(null,x))
{return "list";
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return [cljs.core.str(cljs.core.type.call(null,x))].join('');
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
});
aurora.editor.ui.__GT_rep = (function __GT_rep(value){var name = aurora.editor.ui.datatype_name.call(null,value);return cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),new cljs.core.Keyword(null,"representations","representations",1685697720),name], null));
});
aurora.editor.ui.find_index = (function find_index(needle,haystack){return cljs.core.first.call(null,cljs.core.keep_indexed.call(null,(function (p1__6638_SHARP_,p2__6637_SHARP_){if(cljs.core._EQ_.call(null,p2__6637_SHARP_,needle))
{return p1__6638_SHARP_;
} else
{return null;
}
}),haystack));
});
aurora.editor.ui.ref_name = (function ref_name(stack,cur_step,id){if(cljs.core.truth_(cur_step))
{var temp__4092__auto__ = aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"page","page",1017337345));if(cljs.core.truth_(temp__4092__auto__))
{var page = temp__4092__auto__;var idx = aurora.editor.ui.find_index.call(null,id,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));var cur_idx = aurora.editor.ui.find_index.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,cur_step)),new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));if(cljs.core._EQ_.call(null,(cur_idx - 1),idx))
{return "that";
} else
{if(cljs.core.truth_(idx))
{return [cljs.core.str("step "),cljs.core.str((idx + 1))].join('');
} else
{return null;
}
}
} else
{return null;
}
} else
{return null;
}
});
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword(null,"constant","constant",4741060374),(function (node,stack){var temp__4090__auto__ = aurora.editor.ui.__GT_rep.call(null,(function (){var or__3357__auto__ = new cljs.core.Keyword(null,"data","data",1016980252).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,node));if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return cljs.core.deref.call(null,node);
}
})());if(cljs.core.truth_(temp__4090__auto__))
{var rep = temp__4090__auto__;return rep.call(null,cljs.core.conj.call(null,node,new cljs.core.Keyword(null,"data","data",1016980252)),stack);
} else
{return [cljs.core.str(cljs.core.pr_str.call(null,aurora.editor.ui.x))].join('');
}
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_list_item,new cljs.core.Keyword(null,"constant","constant",4741060374),(function (node,stack){var value = new cljs.core.Keyword(null,"data","data",1016980252).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,node));var name = aurora.editor.ui.datatype_name.call(null,value);return React.DOM.div.call(null,(function (){var obj6641 = {"className":aurora.editor.ui.step_class.call(null,stack),"onClick":aurora.editor.ui.step_click.call(null,stack),"onContextMenu":(function (p1__6639_SHARP_){return aurora.editor.ui.show_menu_BANG_.call(null,p1__6639_SHARP_,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"remove step",new cljs.core.Keyword(null,"action","action",3885920680),(function (){return aurora.editor.ui.remove_step_BANG_.call(null,aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"page","page",1017337345)),node);
})], null)], null));
})};return obj6641;
})(),[((cljs.core.not_EQ_.call(null,"ref",name))?React.DOM.p.call(null,(function (){var obj6643 = {"className":"desc"};return obj6643;
})(),[[cljs.core.str("Create a "),cljs.core.str(name)].join('')]):React.DOM.p.call(null,(function (){var obj6645 = {"className":"desc"};return obj6645;
})(),["With",React.DOM.span.call(null,(function (){var obj6647 = {"className":"ref value"};return obj6647;
})(),[aurora.editor.ui.ref_name.call(null,stack,node,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(value))])])),React.DOM.div.call(null,(function (){var obj6649 = {"className":"result"};return obj6649;
})(),[(function (){var temp__4092__auto__ = aurora.editor.ui.__GT_rep.call(null,value);if(cljs.core.truth_(temp__4092__auto__))
{var rep = temp__4092__auto__;return rep.call(null,cljs.core.conj.call(null,node,new cljs.core.Keyword(null,"data","data",1016980252)),stack);
} else
{return null;
}
})()])]);
}));
cljs.core._add_method.call(null,aurora.editor.ui.step_description,new cljs.core.Keyword(null,"constant","constant",4741060374),(function (step,stack){var value = new cljs.core.Keyword(null,"data","data",1016980252).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step));var name = aurora.editor.ui.datatype_name.call(null,value);return [React.DOM.p.call(null,(function (){var obj6651 = {"className":"desc"};return obj6651;
})(),["Add a ",React.DOM.span.call(null,(function (){var obj6653 = {"className":"value"};return obj6653;
})(),[name])]),React.DOM.div.call(null,(function (){var obj6655 = {"className":"result"};return obj6655;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.Keyword(null,"data","data",1016980252)),stack)])];
}));
aurora.editor.ui.ref__GT_name = (function ref__GT_name(ref){var op = ((cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(ref),new cljs.core.Keyword("ref","id","ref/id",1021254372)))?aurora.editor.cursors.cursor.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(ref)):null);if(cljs.core.truth_(op))
{return new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$2(cljs.core.deref.call(null,op),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(ref));
} else
{return new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.meta.call(null,eval(new cljs.core.Keyword(null,"js","js",1013907643).cljs$core$IFn$_invoke$arity$1(ref))));
}
});
aurora.editor.ui.refs_in_scope = (function refs_in_scope(page,step){if(cljs.core.truth_(step))
{return cljs.core.concat.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)),cljs.core.take_while.call(null,(function (p1__6656_SHARP_){return cljs.core.not_EQ_.call(null,p1__6656_SHARP_,aurora.editor.cursors.cursor__GT_id.call(null,step));
}),new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))));
} else
{return cljs.core.concat.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)),new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));
}
});
/**
* @param {...*} var_args
*/
aurora.editor.ui.ref_menu = (function() { 
var ref_menu__delegate = function (step,stack,p__6657){var vec__6659 = p__6657;var cb = cljs.core.nth.call(null,vec__6659,0,null);return (function (e){if(aurora.editor.cursors.mutable_QMARK_.call(null,step))
{return aurora.editor.ui.show_menu_BANG_.call(null,e,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"map!",new cljs.core.Keyword(null,"action","action",3885920680),(function (){aurora.editor.cursors.swap_BANG_.call(null,step,cljs.core.constantly.call(null,new cljs.core.PersistentArrayMap(null, 1, ["name","chris"], null)));
if(cljs.core.truth_(cb))
{return cb.call(null);
} else
{return null;
}
})], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"list!",new cljs.core.Keyword(null,"action","action",3885920680),(function (){aurora.editor.cursors.swap_BANG_.call(null,step,cljs.core.constantly.call(null,new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2,3], null)));
if(cljs.core.truth_(cb))
{return cb.call(null);
} else
{return null;
}
})], null)], null),(function (){var xs__4735__auto__ = cljs.core.vec.call(null,aurora.editor.ui.refs_in_scope.call(null,aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"page","page",1017337345)),null));var func__4736__auto__ = ((function (xs__4735__auto__){
return (function (ref,index){return new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),[cljs.core.str((index + 1))].join(''),new cljs.core.Keyword(null,"action","action",3885920680),((function (xs__4735__auto__){
return (function (){aurora.editor.cursors.swap_BANG_.call(null,step,cljs.core.constantly.call(null,aurora.editor.ui.ref_id.call(null,ref)));
if(cljs.core.truth_(cb))
{return cb.call(null);
} else
{return null;
}
});})(xs__4735__auto__))
], null);
});})(xs__4735__auto__))
;var len__4737__auto__ = cljs.core.count.call(null,xs__4735__auto__);var index__4738__auto__ = 0;var final__4739__auto__ = cljs.core.transient$.call(null,cljs.core.PersistentVector.EMPTY);while(true){
if(!((index__4738__auto__ < len__4737__auto__)))
{return cljs.core.persistent_BANG_.call(null,final__4739__auto__);
} else
{{
var G__6660 = (index__4738__auto__ + 1);
var G__6661 = cljs.core.conj_BANG_.call(null,final__4739__auto__,func__4736__auto__.call(null,xs__4735__auto__.call(null,index__4738__auto__),index__4738__auto__));
index__4738__auto__ = G__6660;
final__4739__auto__ = G__6661;
continue;
}
}
break;
}
})()));
} else
{return null;
}
});
};
var ref_menu = function (step,stack,var_args){
var p__6657 = null;if (arguments.length > 2) {
  p__6657 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 2),0);} 
return ref_menu__delegate.call(this,step,stack,p__6657);};
ref_menu.cljs$lang$maxFixedArity = 2;
ref_menu.cljs$lang$applyTo = (function (arglist__6662){
var step = cljs.core.first(arglist__6662);
arglist__6662 = cljs.core.next(arglist__6662);
var stack = cljs.core.first(arglist__6662);
var p__6657 = cljs.core.rest(arglist__6662);
return ref_menu__delegate(step,stack,p__6657);
});
ref_menu.cljs$core$IFn$_invoke$arity$variadic = ref_menu__delegate;
return ref_menu;
})()
;
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword("ref","js","ref/js",1021254446),(function (step,stack,opts){return aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,step,new cljs.core.Keyword(null,"js","js",1013907643)),stack);
}));
aurora.editor.ui.open_sub_step = (function open_sub_step(stack,id){var opened = aurora.editor.ui.from_cache.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"open-paths","open-paths",4565364509)], null));var stack_count = cljs.core.count.call(null,stack);if(cljs.core.truth_(cljs.core.get.call(null,opened,stack)))
{return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"open-paths","open-paths",4565364509),stack], null),null);
} else
{return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"open-paths","open-paths",4565364509)], null),cljs.core.reduce.call(null,(function (final$,p__6665){var vec__6666 = p__6665;var path = cljs.core.nth.call(null,vec__6666,0,null);var v = cljs.core.nth.call(null,vec__6666,1,null);if((cljs.core.count.call(null,path) < stack_count))
{return cljs.core.assoc.call(null,final$,path,v);
} else
{return final$;
}
}),new cljs.core.PersistentArrayMap.fromArray([stack,id], true, false),opened));
}
});
cljs.core._add_method.call(null,aurora.editor.ui.item_ui,new cljs.core.Keyword("ref","id","ref/id",1021254372),(function (step,stack,opts){var page = aurora.editor.cursors.cursor.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));var page_QMARK_ = (cljs.core.truth_(page)?cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)),new cljs.core.Keyword(null,"page","page",1017337345)):null);var res = (((cljs.core.not.call(null,page_QMARK_)) && (cljs.core.not.call(null,new cljs.core.Keyword(null,"name-only?","name-only?",3468362691).cljs$core$IFn$_invoke$arity$1(opts))))?aurora.editor.ui.path__GT_result.call(null,cljs.core.conj.call(null,cljs.core.drop.call(null,1,stack),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"step","step",1017444926),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step))], null))):null);if(cljs.core.truth_(res))
{return React.DOM.span.call(null,(function (){var obj6668 = {"className":"ref","onContextMenu":aurora.editor.ui.ref_menu.call(null,step,stack)};return obj6668;
})(),[aurora.editor.ui.item_ui.call(null,aurora.editor.cursors.value_cursor.call(null,res))]);
} else
{if(cljs.core.truth_(page_QMARK_))
{return React.DOM.span.call(null,(function (){var obj6670 = {"className":"ref","onClick":(function (){return aurora.editor.ui.open_sub_step.call(null,stack,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));
}),"onContextMenu":aurora.editor.ui.ref_menu.call(null,step,stack)};return obj6670;
})(),[React.DOM.span.call(null,(function (){var obj6672 = {"className":"value"};return obj6672;
})(),[(function (){var or__3357__auto__ = new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page));if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{return new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page));
}
})()])]);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return React.DOM.span.call(null,(function (){var obj6674 = {"className":"ref","onContextMenu":aurora.editor.ui.ref_menu.call(null,step,stack)};return obj6674;
})(),[React.DOM.div.call(null,(function (){var obj6676 = {"className":"value"};return obj6676;
})(),[(function (){var or__3357__auto__ = aurora.editor.ui.ref_name.call(null,stack,aurora.editor.ui.stack__GT_cursor.call(null,stack,new cljs.core.Keyword(null,"step","step",1017444926)),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step)));if(cljs.core.truth_(or__3357__auto__))
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step));if(cljs.core.truth_(or__3357__auto____$1))
{return or__3357__auto____$1;
} else
{return new cljs.core.Keyword(null,"js","js",1013907643).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step));
}
}
})()])]);
} else
{return null;
}
}
}
}));
aurora.editor.ui.contextmenu = (function contextmenu(){var menu = aurora.editor.ui.from_cache.call(null,new cljs.core.Keyword(null,"menu","menu",1017252049));if(cljs.core.truth_(menu))
{return React.DOM.div.call(null,(function (){var obj6685 = {"id":"menu-shade","onContextMenu":(function (){return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"menu","menu",1017252049)], null),null);
}),"onClick":(function (){return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"menu","menu",1017252049)], null),null);
})};return obj6685;
})(),[React.DOM.ul.call(null,(function (){var obj6687 = {"id":"menu","style":{"left": new cljs.core.Keyword(null,"left","left",1017222009).cljs$core$IFn$_invoke$arity$1(menu), "top": new cljs.core.Keyword(null,"top","top",1014019271).cljs$core$IFn$_invoke$arity$1(menu)}};return obj6687;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"items","items",1114430258).cljs$core$IFn$_invoke$arity$1(menu));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6691 = 0;var item_6692 = (xs__4750__auto__[0]);while(true){
if((index_6691 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,(function (){var obj6690 = {"onClick":((function (index_6691,item_6692){
return (function (){var temp__4092__auto___6693 = new cljs.core.Keyword(null,"action","action",3885920680).cljs$core$IFn$_invoke$arity$1(item_6692);if(cljs.core.truth_(temp__4092__auto___6693))
{var action_6694 = temp__4092__auto___6693;action_6694.call(null);
} else
{}
return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"menu","menu",1017252049)], null),null);
});})(index_6691,item_6692))
};return obj6690;
})(),[new cljs.core.Keyword(null,"label","label",1116631654).cljs$core$IFn$_invoke$arity$1(item_6692)]));
{
var G__6695 = (index_6691 + 1);
var G__6696 = (xs__4750__auto__[(index_6691 + 1)]);
index_6691 = G__6695;
item_6692 = G__6696;
continue;
}
} else
{}
break;
}
return res_sym;
})()])]);
} else
{return null;
}
});
aurora.editor.ui.show_menu_BANG_ = (function show_menu_BANG_(e,items){e.nativeEvent.preventDefault();
e.preventDefault();
e.stopPropagation();
return aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"menu","menu",1017252049)], null),new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"top","top",1014019271),e.clientY,new cljs.core.Keyword(null,"left","left",1017222009),e.clientX,new cljs.core.Keyword(null,"items","items",1114430258),items], null));
});
aurora.editor.ui.editing_view = (function editing_view(stack){return React.DOM.div.call(null,null,[aurora.editor.ui.steps_list.call(null,aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"page","page",1017337345)),stack)]);
});
aurora.editor.ui.add_step_BAR_swap_BANG_ = (function() {
var add_step_BAR_swap_BANG_ = null;
var add_step_BAR_swap_BANG___2 = (function (cursor,v){return add_step_BAR_swap_BANG_.call(null,cursor,v,aurora.editor.ui.constant.call(null,v));
});
var add_step_BAR_swap_BANG___3 = (function (cursor,v,step){if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,cursor)),new cljs.core.Keyword(null,"page","page",1017337345)))
{return aurora.editor.ui.add_step_BANG_.call(null,cursor,step);
} else
{return aurora.editor.cursors.swap_BANG_.call(null,cursor,cljs.core.constantly.call(null,v));
}
});
add_step_BAR_swap_BANG_ = function(cursor,v,step){
switch(arguments.length){
case 2:
return add_step_BAR_swap_BANG___2.call(this,cursor,v);
case 3:
return add_step_BAR_swap_BANG___3.call(this,cursor,v,step);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
add_step_BAR_swap_BANG_.cljs$core$IFn$_invoke$arity$2 = add_step_BAR_swap_BANG___2;
add_step_BAR_swap_BANG_.cljs$core$IFn$_invoke$arity$3 = add_step_BAR_swap_BANG___3;
return add_step_BAR_swap_BANG_;
})()
;
aurora.editor.ui.constant_inserter = (function constant_inserter(cursor){return React.DOM.div.call(null,null,[React.DOM.button.call(null,(function (){var obj6706 = {"onClick":(function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2,3], null));
})};return obj6706;
})(),["list"]),React.DOM.button.call(null,(function (){var obj6708 = {"onClick":(function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,new cljs.core.PersistentArrayMap(null, 2, ["name","chris","height","short"], null));
})};return obj6708;
})(),["map"]),React.DOM.button.call(null,(function (){var obj6710 = {"onClick":(function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,null,aurora.editor.ui.math.call(null));
})};return obj6710;
})(),["math"]),React.DOM.button.call(null,(function (){var obj6712 = {"onClick":(function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,null,aurora.editor.ui.match.call(null));
})};return obj6712;
})(),["match"])]);
});
aurora.editor.ui.ref_inserter = (function ref_inserter(page,cursor){return React.DOM.ul.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.Keyword(null,"args","args",1016906831).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6725 = 0;var refs_6726 = (xs__4750__auto__[0]);while(true){
if((index_6725 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,null,[React.DOM.button.call(null,(function (){var obj6721 = {"onClick":((function (index_6725,refs_6726){
return (function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,aurora.editor.ui.ref_id.call(null,refs_6726));
});})(index_6725,refs_6726))
};return obj6721;
})(),[new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))])]));
{
var G__6727 = (index_6725 + 1);
var G__6728 = (xs__4750__auto__[(index_6725 + 1)]);
index_6725 = G__6727;
refs_6726 = G__6728;
continue;
}
} else
{}
break;
}
return res_sym;
})(),(function (){var count = cljs.core.count.call(null,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)));var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.reverse.call(null,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6729 = 0;var refs_6730 = (xs__4750__auto__[0]);while(true){
if((index_6729 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,null,[React.DOM.button.call(null,(function (){var obj6724 = {"onClick":((function (index_6729,refs_6730){
return (function (){return aurora.editor.ui.add_step_BAR_swap_BANG_.call(null,cursor,aurora.editor.ui.ref_id.call(null,refs_6730));
});})(index_6729,refs_6730))
};return obj6724;
})(),[(count - index_6729)])]));
{
var G__6731 = (index_6729 + 1);
var G__6732 = (xs__4750__auto__[(index_6729 + 1)]);
index_6729 = G__6731;
refs_6730 = G__6732;
continue;
}
} else
{}
break;
}
return res_sym;
})()]);
});
aurora.editor.ui.call_inserter = (function call_inserter(page){return React.DOM.ul.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [aurora.editor.ui.ref_js.call(null,"cljs.core._PLUS_"),((function (res_sym){
return (function (){return new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2], null);
});})(res_sym))
], null),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [aurora.editor.ui.ref_js.call(null,"cljs.core.mapv"),((function (res_sym){
return (function (){var func = aurora.editor.ui.add_page_BANG_.call(null,aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429)),"each thing",new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"anonymous","anonymous",3213060063),true,new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["current"], null)], null));return new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [aurora.editor.ui.ref_id.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(func)),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2,3], null)], null);
});})(res_sym))
], null)], null));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6747 = 0;var G__6742_6748 = (xs__4750__auto__[0]);var vec__6743_6749 = G__6742_6748;var ref_6750 = cljs.core.nth.call(null,vec__6743_6749,0,null);var args_6751 = cljs.core.nth.call(null,vec__6743_6749,1,null);var index_6752__$1 = index_6747;var G__6742_6753__$1 = G__6742_6748;while(true){
var index_6754__$2 = index_6752__$1;var vec__6744_6755 = G__6742_6753__$1;var ref_6756__$1 = cljs.core.nth.call(null,vec__6744_6755,0,null);var args_6757__$1 = cljs.core.nth.call(null,vec__6744_6755,1,null);if((index_6754__$2 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,null,[React.DOM.button.call(null,(function (){var obj6746 = {"onClick":((function (index_6752__$1,G__6742_6753__$1,index_6754__$2,vec__6744_6755,ref_6756__$1,args_6757__$1){
return (function (){return aurora.editor.ui.add_step_BANG_.call(null,page,aurora.editor.ui.call.call(null,ref_6756__$1,args_6757__$1.call(null)));
});})(index_6752__$1,G__6742_6753__$1,index_6754__$2,vec__6744_6755,ref_6756__$1,args_6757__$1))
};return obj6746;
})(),[aurora.editor.ui.ref__GT_name.call(null,ref_6756__$1)])]));
{
var G__6758 = (index_6754__$2 + 1);
var G__6759 = (xs__4750__auto__[(index_6754__$2 + 1)]);
index_6752__$1 = G__6758;
G__6742_6753__$1 = G__6759;
continue;
}
} else
{}
break;
}
return res_sym;
})()]);
});
aurora.editor.ui.inserter = (function inserter(page,cursor){return React.DOM.div.call(null,null,[aurora.editor.ui.constant_inserter.call(null,cursor),aurora.editor.ui.ref_inserter.call(null,aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"page","page",1017337345)),cursor)]);
});
aurora.editor.ui.new_step_helper = (function new_step_helper(page,stack){return React.DOM.div.call(null,(function (){var obj6763 = {"className":"step"};return obj6763;
})(),[(((cljs.core.count.call(null,new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))) === 0))?[React.DOM.p.call(null,null,["Let's create some data to get started!"]),aurora.editor.ui.constant_inserter.call(null,page),aurora.editor.ui.ref_inserter.call(null,page,page)]:[React.DOM.p.call(null,null,["here we go"]),aurora.editor.ui.constant_inserter.call(null,page),aurora.editor.ui.ref_inserter.call(null,page,page),aurora.editor.ui.call_inserter.call(null,page)])]);
});
aurora.editor.ui.nav = (function nav(){return React.DOM.div.call(null,(function (){var obj6778 = {"id":"nav"};return obj6778;
})(),[React.DOM.ul.call(null,(function (){var obj6780 = {"className":"breadcrumb"};return obj6780;
})(),[React.DOM.li.call(null,null,[(function (){var temp__4092__auto__ = aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429));if(cljs.core.truth_(temp__4092__auto__))
{var notebook = temp__4092__auto__;return React.DOM.span.call(null,(function (){var obj6782 = {"onClick":(function (){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc,new cljs.core.Keyword(null,"screen","screen",4401181662),new cljs.core.Keyword(null,"notebooks","notebooks",2797505898),new cljs.core.Keyword(null,"notebook","notebook",2595460429),null,new cljs.core.Keyword(null,"page","page",1017337345),null,new cljs.core.Keyword(null,"stack","stack",1123661306),null);
})};return obj6782;
})(),[new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook))]);
} else
{return null;
}
})(),(function (){var temp__4092__auto__ = aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"page","page",1017337345));if(cljs.core.truth_(temp__4092__auto__))
{var page = temp__4092__auto__;return React.DOM.span.call(null,(function (){var obj6784 = {"onClick":(function (){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc,new cljs.core.Keyword(null,"screen","screen",4401181662),new cljs.core.Keyword(null,"pages","pages",1120330550),new cljs.core.Keyword(null,"page","page",1017337345),null,new cljs.core.Keyword(null,"stack","stack",1123661306),null);
})};return obj6784;
})(),[new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))]);
} else
{return null;
}
})(),(function (){var temp__4092__auto__ = new cljs.core.Keyword(null,"step","step",1017444926).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state));if(cljs.core.truth_(temp__4092__auto__))
{var path = temp__4092__auto__;return [(((cljs.core.count.call(null,path) > 1))?(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.rest.call(null,path));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6790 = 0;var G__6787_6791 = (xs__4750__auto__[0]);var map__6788_6792 = G__6787_6791;var map__6788_6793__$1 = ((cljs.core.seq_QMARK_.call(null,map__6788_6792))?cljs.core.apply.call(null,cljs.core.hash_map,map__6788_6792):map__6788_6792);var page_6794 = cljs.core.get.call(null,map__6788_6793__$1,new cljs.core.Keyword(null,"page","page",1017337345));var notebook_6795 = cljs.core.get.call(null,map__6788_6793__$1,new cljs.core.Keyword(null,"notebook","notebook",2595460429));var index_6796__$1 = index_6790;var G__6787_6797__$1 = G__6787_6791;while(true){
var index_6798__$2 = index_6796__$1;var map__6789_6799 = G__6787_6797__$1;var map__6789_6800__$1 = ((cljs.core.seq_QMARK_.call(null,map__6789_6799))?cljs.core.apply.call(null,cljs.core.hash_map,map__6789_6799):map__6789_6799);var page_6801__$1 = cljs.core.get.call(null,map__6789_6800__$1,new cljs.core.Keyword(null,"page","page",1017337345));var notebook_6802__$1 = cljs.core.get.call(null,map__6789_6800__$1,new cljs.core.Keyword(null,"notebook","notebook",2595460429));if((index_6798__$2 < xs_count__4751__auto__))
{res_sym.push((function (){var temp__4092__auto____$1 = cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),new cljs.core.PersistentVector(null, 4, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"notebooks","notebooks",2797505898),notebook_6802__$1,new cljs.core.Keyword(null,"pages","pages",1120330550),page_6801__$1], null));if(cljs.core.truth_(temp__4092__auto____$1))
{var cur = temp__4092__auto____$1;return React.DOM.span.call(null,null,[cljs.core.get.call(null,cur,new cljs.core.Keyword(null,"desc","desc",1016984067),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cur))]);
} else
{return null;
}
})());
{
var G__6803 = (index_6798__$2 + 1);
var G__6804 = (xs__4750__auto__[(index_6798__$2 + 1)]);
index_6796__$1 = G__6803;
G__6787_6797__$1 = G__6804;
continue;
}
} else
{}
break;
}
return res_sym;
})():null),React.DOM.span.call(null,null,[new cljs.core.Keyword(null,"step","step",1017444926).cljs$core$IFn$_invoke$arity$1(cljs.core.last.call(null,path))])];
} else
{return null;
}
})()])])]);
});
aurora.editor.ui.click_add_notebook = (function click_add_notebook(e){return aurora.editor.ui.add_notebook_BANG_.call(null,"untitled notebook");
});
aurora.editor.ui.notebooks_list = (function notebooks_list(aurora__$1){return React.DOM.ul.call(null,(function (){var obj6818 = {"className":"notebooks"};return obj6818;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,aurora.editor.cursors.cursors.call(null,new cljs.core.Keyword(null,"notebooks","notebooks",2797505898).cljs$core$IFn$_invoke$arity$1(aurora__$1)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6828 = 0;var notebook_6829 = (xs__4750__auto__[0]);while(true){
if((index_6828 < xs_count__4751__auto__))
{res_sym.push((function (){var click = ((function (index_6828,notebook_6829){
return (function (){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc,new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829)),new cljs.core.Keyword(null,"screen","screen",4401181662),new cljs.core.Keyword(null,"pages","pages",1120330550));
});})(index_6828,notebook_6829))
;if(cljs.core.truth_(aurora.editor.ui.input_QMARK_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829)))))
{return React.DOM.li.call(null,(function (){var obj6821 = {"className":"notebook"};return obj6821;
})(),[React.DOM.input.call(null,(function (){var obj6823 = {"type":"text","defaultValue":new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829)),"onKeyPress":((function (index_6828,notebook_6829,click){
return (function (e){if(cljs.core._EQ_.call(null,13,e.charCode))
{aurora.editor.ui.remove_input_BANG_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829)));
return aurora.editor.cursors.swap_BANG_.call(null,notebook_6829,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),e.target.value);
} else
{return null;
}
});})(index_6828,notebook_6829,click))
};return obj6823;
})(),[])]);
} else
{return React.DOM.li.call(null,(function (){var obj6825 = {"className":"notebook","onContextMenu":((function (index_6828,notebook_6829,click){
return (function (p1__6805_SHARP_){return aurora.editor.ui.show_menu_BANG_.call(null,p1__6805_SHARP_,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"Rename",new cljs.core.Keyword(null,"action","action",3885920680),((function (index_6828,notebook_6829,click){
return (function (){return aurora.editor.ui.add_input_BANG_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829)),new cljs.core.Keyword(null,"desc","desc",1016984067));
});})(index_6828,notebook_6829,click))
], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"Remove",new cljs.core.Keyword(null,"action","action",3885920680),((function (index_6828,notebook_6829,click){
return (function (){return aurora.editor.ui.remove_notebook_BANG_.call(null,notebook_6829);
});})(index_6828,notebook_6829,click))
], null)], null));
});})(index_6828,notebook_6829,click))
,"onClick":click};return obj6825;
})(),[new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook_6829))]);
}
})());
{
var G__6830 = (index_6828 + 1);
var G__6831 = (xs__4750__auto__[(index_6828 + 1)]);
index_6828 = G__6830;
notebook_6829 = G__6831;
continue;
}
} else
{}
break;
}
return res_sym;
})(),React.DOM.li.call(null,(function (){var obj6827 = {"className":"add-notebook","onClick":aurora.editor.ui.click_add_notebook};return obj6827;
})(),["+"])]);
});
aurora.editor.ui.click_add_page = (function click_add_page(e,notebook){return aurora.editor.ui.add_page_BANG_.call(null,notebook,"untitled page",new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"args","args",1016906831),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["root"], null)], null));
});
aurora.editor.ui.pages_list = (function pages_list(notebook){return React.DOM.ul.call(null,(function (){var obj6846 = {"className":"notebooks"};return obj6846;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.filter.call(null,((function (res_sym){
return (function (p1__6832_SHARP_){return cljs.core.get.call(null,new cljs.core.Keyword(null,"tags","tags",1017456523).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,p1__6832_SHARP_)),new cljs.core.Keyword(null,"page","page",1017337345));
});})(res_sym))
,aurora.editor.cursors.cursors.call(null,new cljs.core.Keyword(null,"pages","pages",1120330550).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook)))));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6856 = 0;var page_6857 = (xs__4750__auto__[0]);while(true){
if((index_6856 < xs_count__4751__auto__))
{res_sym.push((function (){var click = ((function (index_6856,page_6857){
return (function (){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc,new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857)),new cljs.core.Keyword(null,"screen","screen",4401181662),new cljs.core.Keyword(null,"editor","editor",4001043679),new cljs.core.Keyword(null,"stack","stack",1123661306),aurora.editor.ui.push.call(null,aurora.editor.ui.push.call(null,cljs.core.List.EMPTY,notebook),page_6857));
});})(index_6856,page_6857))
;if(cljs.core.truth_(aurora.editor.ui.input_QMARK_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857)))))
{return React.DOM.li.call(null,(function (){var obj6849 = {"className":"notebook"};return obj6849;
})(),[React.DOM.input.call(null,(function (){var obj6851 = {"type":"text","defaultValue":new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857)),"onKeyPress":((function (index_6856,page_6857,click){
return (function (e){if(cljs.core._EQ_.call(null,13,e.charCode))
{aurora.editor.ui.remove_input_BANG_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857)));
return aurora.editor.cursors.swap_BANG_.call(null,page_6857,cljs.core.assoc,new cljs.core.Keyword(null,"desc","desc",1016984067),e.target.value);
} else
{return null;
}
});})(index_6856,page_6857,click))
};return obj6851;
})(),[])]);
} else
{return React.DOM.li.call(null,(function (){var obj6853 = {"className":"notebook","onContextMenu":((function (index_6856,page_6857,click){
return (function (e){return aurora.editor.ui.show_menu_BANG_.call(null,e,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"Rename",new cljs.core.Keyword(null,"action","action",3885920680),((function (index_6856,page_6857,click){
return (function (){return aurora.editor.ui.add_input_BANG_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857)),new cljs.core.Keyword(null,"desc","desc",1016984067));
});})(index_6856,page_6857,click))
], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"label","label",1116631654),"Remove",new cljs.core.Keyword(null,"action","action",3885920680),((function (index_6856,page_6857,click){
return (function (){return aurora.editor.ui.remove_page_BANG_.call(null,notebook,page_6857);
});})(index_6856,page_6857,click))
], null)], null));
});})(index_6856,page_6857,click))
,"onClick":click};return obj6853;
})(),[new cljs.core.Keyword(null,"desc","desc",1016984067).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page_6857))]);
}
})());
{
var G__6858 = (index_6856 + 1);
var G__6859 = (xs__4750__auto__[(index_6856 + 1)]);
index_6856 = G__6858;
page_6857 = G__6859;
continue;
}
} else
{}
break;
}
return res_sym;
})(),React.DOM.li.call(null,(function (){var obj6855 = {"className":"add-notebook","onClick":(function (p1__6833_SHARP_){return aurora.editor.ui.click_add_page.call(null,p1__6833_SHARP_,notebook);
})};return obj6855;
})(),["+"])]);
});
aurora.editor.ui.aurora_ui = (function aurora_ui(){return React.DOM.div.call(null,null,[aurora.editor.ui.contextmenu.call(null),aurora.editor.ui.nav.call(null),React.DOM.div.call(null,(function (){var obj6866 = {"id":"content"};return obj6866;
})(),[(function (){var pred__6867 = cljs.core._EQ_;var expr__6868 = new cljs.core.Keyword(null,"screen","screen",4401181662).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state));if(cljs.core.truth_(pred__6867.call(null,new cljs.core.Keyword(null,"notebooks","notebooks",2797505898),expr__6868)))
{return aurora.editor.ui.notebooks_list.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state));
} else
{if(cljs.core.truth_(pred__6867.call(null,new cljs.core.Keyword(null,"pages","pages",1120330550),expr__6868)))
{return aurora.editor.ui.pages_list.call(null,aurora.editor.cursors.cursor.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state))));
} else
{if(cljs.core.truth_(pred__6867.call(null,new cljs.core.Keyword(null,"editor","editor",4001043679),expr__6868)))
{return aurora.editor.ui.editing_view.call(null,new cljs.core.Keyword(null,"stack","stack",1123661306).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)));
} else
{throw (new Error([cljs.core.str("No matching clause: "),cljs.core.str(expr__6868)].join('')));
}
}
}
})()])]);
});
aurora.editor.ui.table_map_ui = (function table_map_ui(table,stack){return React.DOM.div.call(null,(function (){var obj6886 = {"className":"table-editor"};return obj6886;
})(),[React.DOM.table.call(null,(function (){var obj6888 = {"className":"table","onContextMenu":aurora.editor.ui.ref_menu.call(null,table,stack)};return obj6888;
})(),[React.DOM.thead.call(null,null,[React.DOM.tr.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.deref.call(null,table).call(null,"headers"));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6898 = 0;var k_6899 = (xs__4750__auto__[0]);while(true){
if((index_6898 < xs_count__4751__auto__))
{res_sym.push(React.DOM.th.call(null,null,[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,table,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, ["headers",index_6898], null)))]));
{
var G__6900 = (index_6898 + 1);
var G__6901 = (xs__4750__auto__[(index_6898 + 1)]);
index_6898 = G__6900;
k_6899 = G__6901;
continue;
}
} else
{}
break;
}
return res_sym;
})()]),React.DOM.tbody.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.deref.call(null,table).call(null,"rows"));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6902 = 0;var row_6903 = (xs__4750__auto__[0]);while(true){
if((index_6902 < xs_count__4751__auto__))
{res_sym.push(React.DOM.tr.call(null,null,[(function (){var path = new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, ["rows",index_6902], null);var res_sym__$1 = [];var xs__4750__auto____$1 = cljs.core.to_array.call(null,row_6903);var xs_count__4751__auto____$1 = xs__4750__auto____$1.length;var index_6904__$1 = 0;var v_6905 = (xs__4750__auto____$1[0]);while(true){
if((index_6904__$1 < xs_count__4751__auto____$1))
{res_sym__$1.push(React.DOM.td.call(null,null,[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,table,cljs.core.conj.call(null,path,index_6904__$1)))]));
{
var G__6906 = (index_6904__$1 + 1);
var G__6907 = (xs__4750__auto____$1[(index_6904__$1 + 1)]);
index_6904__$1 = G__6906;
v_6905 = G__6907;
continue;
}
} else
{}
break;
}
return res_sym__$1;
})()]));
{
var G__6908 = (index_6902 + 1);
var G__6909 = (xs__4750__auto__[(index_6902 + 1)]);
index_6902 = G__6908;
row_6903 = G__6909;
continue;
}
} else
{}
break;
}
return res_sym;
})()])])]),React.DOM.span.call(null,(function (){var obj6893 = {"className":"add-col","onClick":(function (){return aurora.editor.cursors.swap_BANG_.call(null,table,(function (p1__6870_SHARP_){return cljs.core.update_in.call(null,cljs.core.update_in.call(null,cljs.core.update_in.call(null,p1__6870_SHARP_,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["headers"], null),cljs.core.conj,"foo"),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["columns"], null),cljs.core.conj,aurora.editor.ui.ref_js.call(null,"aurora.runtime.table.identity_column")),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["rows"], null),(function (x){return cljs.core.mapv.call(null,(function (c){return cljs.core.conj.call(null,c,0);
}),x);
}));
}));
})};return obj6893;
})(),["+"]),React.DOM.div.call(null,(function (){var obj6895 = {"className":"add-row-wrapper"};return obj6895;
})(),[React.DOM.span.call(null,(function (){var obj6897 = {"className":"add-row","onClick":(function (){return aurora.editor.cursors.swap_BANG_.call(null,table,(function (p1__6871_SHARP_){return cljs.core.update_in.call(null,p1__6871_SHARP_,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["rows"], null),cljs.core.conj,cljs.core.mapv.call(null,cljs.core.constantly.call(null,0),cljs.core.deref.call(null,table).call(null,"headers")));
}));
})};return obj6897;
})(),["+"])])]);
});
aurora.editor.ui.table_ui = (function table_ui(table,stack){return React.DOM.div.call(null,(function (){var obj6928 = {"className":"table-editor"};return obj6928;
})(),[React.DOM.table.call(null,(function (){var obj6930 = {"className":"table","onContextMenu":aurora.editor.ui.ref_menu.call(null,table,stack)};return obj6930;
})(),[React.DOM.thead.call(null,null,[React.DOM.tr.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,aurora.runtime.table.headers.call(null,cljs.core.deref.call(null,table)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6944 = 0;var k_6945 = (xs__4750__auto__[0]);while(true){
if((index_6944 < xs_count__4751__auto__))
{res_sym.push(React.DOM.th.call(null,null,[React.DOM.span.call(null,(function (){var obj6933 = {"className":"value"};return obj6933;
})(),[k_6945])]));
{
var G__6946 = (index_6944 + 1);
var G__6947 = (xs__4750__auto__[(index_6944 + 1)]);
index_6944 = G__6946;
k_6945 = G__6947;
continue;
}
} else
{}
break;
}
return res_sym;
})()]),React.DOM.tbody.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,aurora.runtime.table._rows.call(null,cljs.core.deref.call(null,table)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6948 = 0;var row_6949 = (xs__4750__auto__[0]);while(true){
if((index_6948 < xs_count__4751__auto__))
{res_sym.push(React.DOM.tr.call(null,null,[(function (){var path = new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, ["rows",index_6948], null);var res_sym__$1 = [];var xs__4750__auto____$1 = cljs.core.to_array.call(null,row_6949);var xs_count__4751__auto____$1 = xs__4750__auto____$1.length;var index_6950__$1 = 0;var v_6951 = (xs__4750__auto____$1[0]);while(true){
if((index_6950__$1 < xs_count__4751__auto____$1))
{res_sym__$1.push(React.DOM.td.call(null,null,[React.DOM.span.call(null,(function (){var obj6937 = {"className":"value"};return obj6937;
})(),[row_6949.call(null,index_6950__$1)])]));
{
var G__6952 = (index_6950__$1 + 1);
var G__6953 = (xs__4750__auto____$1[(index_6950__$1 + 1)]);
index_6950__$1 = G__6952;
v_6951 = G__6953;
continue;
}
} else
{}
break;
}
return res_sym__$1;
})()]));
{
var G__6954 = (index_6948 + 1);
var G__6955 = (xs__4750__auto__[(index_6948 + 1)]);
index_6948 = G__6954;
row_6949 = G__6955;
continue;
}
} else
{}
break;
}
return res_sym;
})()])])]),React.DOM.span.call(null,(function (){var obj6939 = {"className":"add-col"};return obj6939;
})(),["+"]),React.DOM.div.call(null,(function (){var obj6941 = {"className":"add-row-wrapper"};return obj6941;
})(),[React.DOM.span.call(null,(function (){var obj6943 = {"className":"add-row"};return obj6943;
})(),["+"])])]);
});
aurora.editor.ui.math_expression_ui = (function math_expression_ui(x,stack){if(cljs.core.vector_QMARK_.call(null,cljs.core.deref.call(null,x)))
{return React.DOM.span.call(null,(function (){var obj6964 = {"className":"math-expression"};return obj6964;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.interpose.call(null,new cljs.core.Keyword(null,"op","op",1013907795),cljs.core.rest.call(null,cljs.core.deref.call(null,x))));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_6970 = 0;var item_6971 = (xs__4750__auto__[0]);while(true){
if((index_6970 < xs_count__4751__auto__))
{res_sym.push((function (){var real_index = (((index_6970 + 1) / 2) + 1);if(cljs.core._EQ_.call(null,item_6971,new cljs.core.Keyword(null,"op","op",1013907795)))
{return math_expression_ui.call(null,cljs.core.conj.call(null,x,0),stack);
} else
{return math_expression_ui.call(null,cljs.core.conj.call(null,x,real_index),stack);
}
})());
{
var G__6972 = (index_6970 + 1);
var G__6973 = (xs__4750__auto__[(index_6970 + 1)]);
index_6970 = G__6972;
item_6971 = G__6973;
continue;
}
} else
{}
break;
}
return res_sym;
})()]);
} else
{if(cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"type","type",1017479852).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,x)),new cljs.core.Keyword("ref","js","ref/js",1021254446)))
{return React.DOM.span.call(null,(function (){var obj6967 = {"className":"mathop"};return obj6967;
})(),[aurora.editor.ui.item_ui.call(null,x,stack)]);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{return React.DOM.span.call(null,(function (){var obj6969 = {"className":"mathval"};return obj6969;
})(),[aurora.editor.ui.item_ui.call(null,x,stack)]);
} else
{return null;
}
}
}
});
aurora.editor.ui.math_ui = (function math_ui(x,stack){return React.DOM.div.call(null,(function (){var obj6977 = {"className":"step"};return obj6977;
})(),[aurora.editor.ui.math_expression_ui.call(null,cljs.core.conj.call(null,x,new cljs.core.Keyword(null,"expression","expression",3513419274)),stack)," = ",aurora.editor.ui.item_ui.call(null,aurora.editor.cursors.value_cursor.call(null,aurora.editor.ui.path__GT_result.call(null,stack)),stack)]);
});
aurora.editor.ui.cell = (function cell(x,parser,stack){var path = aurora.editor.cursors.cursor__GT_path.call(null,x);var commit = ((function (path){
return (function (e){aurora.editor.cursors.swap_BANG_.call(null,x,cljs.core.constantly.call(null,parser.call(null,e.target.value)));
return aurora.editor.ui.remove_input_BANG_.call(null,path);
});})(path))
;if(cljs.core.truth_(aurora.editor.ui.input_QMARK_.call(null,path)))
{return React.DOM.input.call(null,(function (){var obj6983 = {"type":"text","className":"focused","tabIndex":-1,"style":{"width": (10 * cljs.core.count.call(null,[cljs.core.str(cljs.core.deref.call(null,x))].join('')))},"defaultValue":cljs.core.deref.call(null,x),"onKeyPress":(function (e){if(cljs.core._EQ_.call(null,13,e.charCode))
{return commit.call(null,e);
} else
{return null;
}
}),"onBlur":commit};return obj6983;
})(),[]);
} else
{return React.DOM.span.call(null,(function (){var obj6985 = {"className":"value","onContextMenu":aurora.editor.ui.ref_menu.call(null,x,stack),"onClick":(function (e){if(aurora.editor.cursors.mutable_QMARK_.call(null,x))
{return aurora.editor.ui.add_input_BANG_.call(null,path,true);
} else
{return null;
}
})};return obj6985;
})(),[[cljs.core.str(cljs.core.deref.call(null,x))].join('')]);
}
});
aurora.editor.ui.vec_remove = (function vec_remove(x,index){return cljs.core.vec.call(null,cljs.core.concat.call(null,cljs.core.subvec.call(null,x,0,index),cljs.core.subvec.call(null,x,(index + 1),cljs.core.count.call(null,x))));
});
aurora.editor.ui.list_ui = (function list_ui(list,stack){return React.DOM.ul.call(null,(function (){var obj6996 = {"className":"list"};return obj6996;
})(),[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.deref.call(null,list));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_7004 = 0;var x_7005 = (xs__4750__auto__[0]);while(true){
if((index_7004 < xs_count__4751__auto__))
{res_sym.push(React.DOM.li.call(null,(function (){var obj6999 = {"className":"list-item"};return obj6999;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,list,index_7004),stack),((aurora.editor.cursors.mutable_QMARK_.call(null,list))?React.DOM.span.call(null,(function (){var obj7001 = {"className":"remove-list-item","onClick":((function (index_7004,x_7005){
return (function (){return aurora.editor.cursors.swap_BANG_.call(null,list,aurora.editor.ui.vec_remove,index_7004);
});})(index_7004,x_7005))
};return obj7001;
})(),[]):null)]));
{
var G__7006 = (index_7004 + 1);
var G__7007 = (xs__4750__auto__[(index_7004 + 1)]);
index_7004 = G__7006;
x_7005 = G__7007;
continue;
}
} else
{}
break;
}
return res_sym;
})(),React.DOM.li.call(null,(function (){var obj7003 = {"className":"add-list-item"};return obj7003;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,list,cljs.core.count.call(null,cljs.core.deref.call(null,list))),stack)])]);
});
aurora.editor.ui.map_ui = (function map_ui(x,stack){return React.DOM.div.call(null,(function (){var obj7028 = {"className":"map-editor"};return obj7028;
})(),[React.DOM.table.call(null,(function (){var obj7030 = {"className":"map"};return obj7030;
})(),[React.DOM.tbody.call(null,null,[(function (){var res_sym = [];var xs__4750__auto__ = cljs.core.to_array.call(null,cljs.core.seq.call(null,cljs.core.deref.call(null,x)));var xs_count__4751__auto__ = xs__4750__auto__.length;var index_7046 = 0;var G__7033_7047 = (xs__4750__auto__[0]);var vec__7034_7048 = G__7033_7047;var k_7049 = cljs.core.nth.call(null,vec__7034_7048,0,null);var v_7050 = cljs.core.nth.call(null,vec__7034_7048,1,null);var index_7051__$1 = index_7046;var G__7033_7052__$1 = G__7033_7047;while(true){
var index_7053__$2 = index_7051__$1;var vec__7035_7054 = G__7033_7052__$1;var k_7055__$1 = cljs.core.nth.call(null,vec__7035_7054,0,null);var v_7056__$1 = cljs.core.nth.call(null,vec__7035_7054,1,null);if((index_7053__$2 < xs_count__4751__auto__))
{res_sym.push(React.DOM.tr.call(null,(function (){var obj7037 = {"className":"map-item"};return obj7037;
})(),[React.DOM.td.call(null,(function (){var obj7039 = {"className":"map-key"};return obj7039;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,x,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword("aurora.editor.ui","key","aurora.editor.ui/key",4080100511),k_7055__$1], null)], null)),stack)]),React.DOM.td.call(null,(function (){var obj7041 = {"className":"map-value"};return obj7041;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,x,k_7055__$1),stack),((aurora.editor.cursors.mutable_QMARK_.call(null,x))?React.DOM.span.call(null,(function (){var obj7043 = {"className":"remove-map-item","onClick":((function (index_7051__$1,G__7033_7052__$1,index_7053__$2,vec__7035_7054,k_7055__$1,v_7056__$1){
return (function (){return aurora.editor.cursors.swap_BANG_.call(null,x,cljs.core.dissoc,k_7055__$1);
});})(index_7051__$1,G__7033_7052__$1,index_7053__$2,vec__7035_7054,k_7055__$1,v_7056__$1))
};return obj7043;
})(),[]):null)])]));
{
var G__7057 = (index_7053__$2 + 1);
var G__7058 = (xs__4750__auto__[(index_7053__$2 + 1)]);
index_7051__$1 = G__7057;
G__7033_7052__$1 = G__7058;
continue;
}
} else
{}
break;
}
return res_sym;
})()])]),React.DOM.div.call(null,(function (){var obj7045 = {"className":"add-map-key"};return obj7045;
})(),[aurora.editor.ui.item_ui.call(null,cljs.core.conj.call(null,x,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword("aurora.editor.ui","key","aurora.editor.ui/key",4080100511),"add key"], null)], null)))])]);
});
aurora.editor.ui.cell_parser = (function cell_parser(v){if(cljs.core.truth_(cljs.core.re_seq.call(null,/[^\d\.]/,v)))
{return v;
} else
{return cljs.reader.read_string.call(null,v);
}
});
aurora.editor.ui.build_rep_cache = (function build_rep_cache(state){return cljs.core.assoc_in.call(null,state,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),new cljs.core.Keyword(null,"representations","representations",1685697720)], null),new cljs.core.PersistentArrayMap(null, 8, ["math",(function (x,stack){return aurora.editor.ui.math_ui.call(null,x,stack);
}),"rect",(function (x,stack){return null;
}),"ref",(function (x,stack){return aurora.editor.ui.item_ui.call(null,x,stack);
}),"map",(function (x,stack){return aurora.editor.ui.map_ui.call(null,x,stack);
}),"list",(function (x,stack){return aurora.editor.ui.list_ui.call(null,x,stack);
}),"number",(function (x,stack){return aurora.editor.ui.cell.call(null,x,aurora.editor.ui.cell_parser,stack);
}),"string",(function (x,stack){return aurora.editor.ui.cell.call(null,x,aurora.editor.ui.cell_parser,stack);
}),"table",(function (x,stack){if(cljs.core.map_QMARK_.call(null,cljs.core.deref.call(null,x)))
{return aurora.editor.ui.table_map_ui.call(null,x,stack);
} else
{return aurora.editor.ui.table_ui.call(null,x,stack);
}
})], null));
});
aurora.editor.ui.path__GT_step = (function path__GT_step(path){var vec__7060 = cljs.core.first.call(null,path);var type = cljs.core.nth.call(null,vec__7060,0,null);var id = cljs.core.nth.call(null,vec__7060,1,null);var step = ((cljs.core._EQ_.call(null,new cljs.core.Keyword(null,"step","step",1017444926),type))?id:null);if(cljs.core.truth_(step))
{return aurora.editor.cursors.cursor.call(null,step);
} else
{return null;
}
});
aurora.editor.ui.current = (function current(key){var temp__4092__auto__ = cljs.core.deref.call(null,aurora.editor.core.aurora_state).call(null,key);if(cljs.core.truth_(temp__4092__auto__))
{var v = temp__4092__auto__;var pred__7064 = cljs.core._EQ_;var expr__7065 = key;if(cljs.core.truth_(pred__7064.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429),expr__7065)))
{return aurora.editor.cursors.cursor.call(null,v);
} else
{if(cljs.core.truth_(pred__7064.call(null,new cljs.core.Keyword(null,"page","page",1017337345),expr__7065)))
{return aurora.editor.cursors.cursor.call(null,v);
} else
{if(cljs.core.truth_(pred__7064.call(null,new cljs.core.Keyword(null,"step","step",1017444926),expr__7065)))
{return aurora.editor.ui.path__GT_step.call(null,new cljs.core.Keyword(null,"stack","stack",1123661306).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)));
} else
{throw (new Error([cljs.core.str("No matching clause: "),cljs.core.str(expr__7065)].join('')));
}
}
}
} else
{return null;
}
});
aurora.editor.ui.from_cache = (function from_cache(path){if(cljs.core.coll_QMARK_.call(null,path))
{return cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012)], null),path));
} else
{return cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),path], null));
}
});
aurora.editor.ui.input_QMARK_ = (function input_QMARK_(id){return cljs.core.get_in.call(null,cljs.core.deref.call(null,aurora.editor.core.aurora_state),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),new cljs.core.Keyword(null,"inputs","inputs",4125005147),id], null));
});
aurora.editor.ui.constant = (function() {
var constant = null;
var constant__1 = (function (data){return constant.call(null,data,cljs.core.PersistentArrayMap.EMPTY);
});
var constant__2 = (function (data,opts){return cljs.core.merge.call(null,new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"constant","constant",4741060374),new cljs.core.Keyword(null,"data","data",1016980252),data], null),opts);
});
constant = function(data,opts){
switch(arguments.length){
case 1:
return constant__1.call(this,data);
case 2:
return constant__2.call(this,data,opts);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
constant.cljs$core$IFn$_invoke$arity$1 = constant__1;
constant.cljs$core$IFn$_invoke$arity$2 = constant__2;
return constant;
})()
;
aurora.editor.ui.call = (function() {
var call = null;
var call__2 = (function (ref,args){return call.call(null,ref,args,cljs.core.PersistentArrayMap.EMPTY);
});
var call__3 = (function (ref,args,opts){return cljs.core.merge.call(null,new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"call","call",1016950224),new cljs.core.Keyword(null,"ref","ref",1014017029),ref,new cljs.core.Keyword(null,"args","args",1016906831),args], null),opts);
});
call = function(ref,args,opts){
switch(arguments.length){
case 2:
return call__2.call(this,ref,args);
case 3:
return call__3.call(this,ref,args,opts);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
call.cljs$core$IFn$_invoke$arity$2 = call__2;
call.cljs$core$IFn$_invoke$arity$3 = call__3;
return call;
})()
;
aurora.editor.ui.math = (function math(){return new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"math","math",1017248378),new cljs.core.Keyword(null,"expression","expression",3513419274),new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"+"], null),3,4], null)], null);
});
aurora.editor.ui.match_branch = (function match_branch(){return new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("match","branch","match/branch",2096945282),new cljs.core.Keyword(null,"pattern","pattern",4517781250),"foo",new cljs.core.Keyword(null,"guards","guards",4073761248),cljs.core.PersistentVector.EMPTY,new cljs.core.Keyword(null,"action","action",3885920680),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"constant","constant",4741060374),new cljs.core.Keyword(null,"data","data",1016980252),"wheeee"], null)], null);
});
aurora.editor.ui.match = (function match(){return new cljs.core.PersistentArrayMap(null, 3, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"match","match",1117572407),new cljs.core.Keyword(null,"arg","arg",1014001096),"foo",new cljs.core.Keyword(null,"branches","branches",988497218),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [aurora.editor.ui.match_branch.call(null)], null)], null);
});
aurora.editor.ui.table = (function table(){return new cljs.core.PersistentArrayMap(null, 3, ["headers",new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, ["a","b"], null),"columns",new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"aurora.runtime.table.identity_column"], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),"aurora.runtime.table.identity_column"], null)], null),"rows",new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2], null),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [3,4], null)], null)], null);
});
aurora.editor.ui.ref_id = (function ref_id(id){return new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","id","ref/id",1021254372),new cljs.core.Keyword(null,"id","id",1013907597),id], null);
});
aurora.editor.ui.ref_js = (function ref_js(js){return new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword("ref","js","ref/js",1021254446),new cljs.core.Keyword(null,"js","js",1013907643),js], null);
});
aurora.editor.ui.assoc_cache_BANG_ = (function assoc_cache_BANG_(path,v){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc_in,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012)], null),path),v);
});
aurora.editor.ui.add_input_BANG_ = (function add_input_BANG_(id,path){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc_in,new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),new cljs.core.Keyword(null,"inputs","inputs",4125005147),id], null),path);
});
aurora.editor.ui.remove_input_BANG_ = (function remove_input_BANG_(id){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.update_in,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"cache","cache",1108321012),new cljs.core.Keyword(null,"inputs","inputs",4125005147)], null),cljs.core.dissoc,id);
});
aurora.editor.ui.add_index_BANG_ = (function add_index_BANG_(thing){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.assoc_in,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"index","index",1114250308),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(thing)], null),thing);
});
aurora.editor.ui.add_notebook_BANG_ = (function add_notebook_BANG_(desc){var notebook = new cljs.core.PersistentArrayMap(null, 4, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597),aurora.compiler.compiler.new_id.call(null),new cljs.core.Keyword(null,"desc","desc",1016984067),desc,new cljs.core.Keyword(null,"pages","pages",1120330550),cljs.core.PersistentVector.EMPTY], null);if(cljs.core.truth_(aurora.compiler.ast.notebook_BANG_.call(null,new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)),notebook)))
{aurora.editor.ui.add_index_BANG_.call(null,notebook);
aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.update_in,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"notebooks","notebooks",2797505898)], null),cljs.core.conj,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(notebook));
aurora.editor.ui.add_input_BANG_.call(null,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(notebook),new cljs.core.Keyword(null,"desc","desc",1016984067));
return notebook;
} else
{return null;
}
});
aurora.editor.ui.remove_notebook_BANG_ = (function remove_notebook_BANG_(notebook){return aurora.editor.cursors.swap_BANG_.call(null,aurora.editor.core.aurora_state,cljs.core.update_in,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"notebooks","notebooks",2797505898)], null),(function (p1__7067_SHARP_){return cljs.core.vec.call(null,cljs.core.remove.call(null,cljs.core.PersistentHashSet.fromArray([new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(notebook)], true),p1__7067_SHARP_));
}));
});
/**
* @param {...*} var_args
*/
aurora.editor.ui.add_page_BANG_ = (function() { 
var add_page_BANG___delegate = function (notebook,desc,p__7068){var vec__7070 = p__7068;var opts = cljs.core.nth.call(null,vec__7070,0,null);var page = cljs.core.merge.call(null,new cljs.core.PersistentArrayMap(null, 6, [new cljs.core.Keyword(null,"type","type",1017479852),new cljs.core.Keyword(null,"page","page",1017337345),new cljs.core.Keyword(null,"id","id",1013907597),aurora.compiler.compiler.new_id.call(null),new cljs.core.Keyword(null,"tags","tags",1017456523),((cljs.core.not.call(null,new cljs.core.Keyword(null,"anonymous","anonymous",3213060063).cljs$core$IFn$_invoke$arity$1(opts)))?new cljs.core.PersistentHashSet(null, new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"page","page",1017337345),null], null), null):cljs.core.PersistentHashSet.EMPTY),new cljs.core.Keyword(null,"args","args",1016906831),cljs.core.PersistentVector.EMPTY,new cljs.core.Keyword(null,"desc","desc",1016984067),desc,new cljs.core.Keyword(null,"steps","steps",1123665561),cljs.core.PersistentVector.EMPTY], null),opts);if(cljs.core.truth_(aurora.compiler.ast.page_BANG_.call(null,new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)),page)))
{aurora.editor.ui.add_index_BANG_.call(null,page);
aurora.editor.cursors.swap_BANG_.call(null,notebook,cljs.core.update_in,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"pages","pages",1120330550)], null),cljs.core.conj,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(page));
return page;
} else
{return null;
}
};
var add_page_BANG_ = function (notebook,desc,var_args){
var p__7068 = null;if (arguments.length > 2) {
  p__7068 = cljs.core.array_seq(Array.prototype.slice.call(arguments, 2),0);} 
return add_page_BANG___delegate.call(this,notebook,desc,p__7068);};
add_page_BANG_.cljs$lang$maxFixedArity = 2;
add_page_BANG_.cljs$lang$applyTo = (function (arglist__7071){
var notebook = cljs.core.first(arglist__7071);
arglist__7071 = cljs.core.next(arglist__7071);
var desc = cljs.core.first(arglist__7071);
var p__7068 = cljs.core.rest(arglist__7071);
return add_page_BANG___delegate(notebook,desc,p__7068);
});
add_page_BANG_.cljs$core$IFn$_invoke$arity$variadic = add_page_BANG___delegate;
return add_page_BANG_;
})()
;
aurora.editor.ui.remove_page_BANG_ = (function remove_page_BANG_(notebook,page){return aurora.editor.cursors.swap_BANG_.call(null,page,cljs.core.assoc,new cljs.core.Keyword(null,"pages","pages",1120330550),cljs.core.vec.call(null,cljs.core.remove.call(null,cljs.core.PersistentHashSet.fromArray([new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page))], true),new cljs.core.Keyword(null,"pages","pages",1120330550).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,notebook)))));
});
aurora.editor.ui.add_step_BANG_ = (function add_step_BANG_(page,info){try{var step = cljs.core.merge.call(null,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"id","id",1013907597),aurora.compiler.compiler.new_id.call(null)], null),info);if(cljs.core.truth_(aurora.compiler.ast.step_BANG_.call(null,new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)),step)))
{aurora.editor.ui.add_index_BANG_.call(null,step);
aurora.editor.cursors.swap_BANG_.call(null,page,cljs.core.update_in,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"steps","steps",1123665561)], null),cljs.core.conj,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(step));
return step;
} else
{return null;
}
}catch (e7073){var e = e7073;return console.error(cljs.core.pr_str.call(null,e));
}});
aurora.editor.ui.remove_step_BANG_ = (function remove_step_BANG_(page,step){return aurora.editor.cursors.swap_BANG_.call(null,page,cljs.core.assoc,new cljs.core.Keyword(null,"steps","steps",1123665561),cljs.core.vec.call(null,cljs.core.remove.call(null,cljs.core.PersistentHashSet.fromArray([new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,step))], true),new cljs.core.Keyword(null,"steps","steps",1123665561).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,page)))));
});
aurora.editor.ui.freeze = (function freeze(state){return cljs.core.pr_str.call(null,cljs.core.dissoc.call(null,state,new cljs.core.Keyword(null,"cache","cache",1108321012)));
});
aurora.editor.ui.store_BANG_ = (function store_BANG_(state){return (localStorage["aurora-state"] = aurora.editor.ui.freeze.call(null,state));
});
aurora.editor.ui.thaw = (function thaw(state){var state__$1 = ((typeof state === 'string')?cljs.reader.read_string.call(null,state):state);return cljs.core.update_in.call(null,aurora.editor.ui.build_rep_cache.call(null,state__$1),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"index","index",1114250308)], null),cljs.core.merge,aurora.compiler.ast.core);
});
aurora.editor.ui.repopulate = (function repopulate(){var stored = (localStorage["aurora-state"]);if(cljs.core.truth_((function (){var and__3345__auto__ = stored;if(cljs.core.truth_(and__3345__auto__))
{return (cljs.core.not_EQ_.call(null,"null",stored)) && (cljs.core.not_EQ_.call(null,stored,""));
} else
{return and__3345__auto__;
}
})()))
{return cljs.core.reset_BANG_.call(null,aurora.editor.core.aurora_state,aurora.editor.ui.thaw.call(null,stored));
} else
{return cljs.core.reset_BANG_.call(null,aurora.editor.core.aurora_state,aurora.editor.ui.thaw.call(null,aurora.editor.core.default_state));
}
});
aurora.editor.ui.clear_storage_BANG_ = (function clear_storage_BANG_(){return (localStorage["aurora-state"] = null);
});
cljs.core.add_watch.call(null,aurora.editor.core.aurora_state,new cljs.core.Keyword(null,"storage","storage",3424597485),(function (_,___$1,___$2,cur){return aurora.editor.ui.store_BANG_.call(null,cur);
}));
aurora.editor.ui.run_stack = cljs.core.atom.call(null,null);
aurora.editor.ui.cur_state = cljs.core.atom.call(null,aurora.runtime.table.table.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, ["counter"], null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [aurora.runtime.table.identity_column], null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [0], null)], null)));
aurora.editor.ui.prev = null;
aurora.editor.ui.find_error_frame = (function find_error_frame(stack){var frame = stack;var page_stack = new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"page","page",1017337345),(stack["id"])], null)], null);while(true){
if(cljs.core.truth_(frame))
{if(cljs.core.truth_(frame.exception))
{return new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"stack","stack",1123661306),page_stack,new cljs.core.Keyword(null,"frame","frame",1111596255),frame], null);
} else
{var temp__4092__auto__ = cljs.core.last.call(null,(frame["calls"]));if(cljs.core.truth_(temp__4092__auto__))
{var next_frame = temp__4092__auto__;{
var G__7074 = next_frame;
var G__7075 = cljs.core.conj.call(null,page_stack,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"page","page",1017337345),(next_frame["id"])], null));
frame = G__7074;
page_stack = G__7075;
continue;
}
} else
{return null;
}
}
} else
{return null;
}
break;
}
});
aurora.editor.ui.compile_index = (function compile_index(index,notebook){try{return aurora.compiler.jsth.expression__GT_string.call(null,aurora.compiler.compiler.notebook__GT_jsth.call(null,index,cljs.core.get.call(null,index,new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(notebook))));
}catch (e7077){var e = e7077;console.error(cljs.core.pr_str.call(null,e));
return null;
}});
aurora.editor.ui.run_index = (function run_index(index,notebook,page,state){var start = aurora.editor.ui.now.call(null);var source = aurora.editor.ui.compile_index.call(null,index,notebook);var _ = document.getElementById("compile-perf").innerHTML = (aurora.editor.ui.now.call(null) - start);var start__$1 = aurora.editor.ui.now.call(null);var notebook_js = (cljs.core.truth_(source)?eval([cljs.core.str("("),cljs.core.str(source),cljs.core.str("());")].join('')):null);var stack = [];var func = (cljs.core.truth_(notebook_js)?(notebook_js[[cljs.core.str("value_"),cljs.core.str(new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(page))].join('')]):null);if(cljs.core.truth_(notebook_js))
{(notebook_js["next_state"] = state);
(notebook_js["stack"] = stack);
try{var v = new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [func.call(null,state,cljs.core.PersistentVector.EMPTY),notebook_js.next_state,(stack[0])], null);aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"error","error",1110689146)], null),null);
document.getElementById("run-perf").innerHTML = (aurora.editor.ui.now.call(null) - start__$1);
return v;
}catch (e7080){var e = e7080;var v = new cljs.core.PersistentVector(null, 3, 5, cljs.core.PersistentVector.EMPTY_NODE, [e,notebook_js.next_state,(stack[0])], null);var map__7081 = aurora.editor.ui.find_error_frame.call(null,(stack[0]));var map__7081__$1 = ((cljs.core.seq_QMARK_.call(null,map__7081))?cljs.core.apply.call(null,cljs.core.hash_map,map__7081):map__7081);var frame = cljs.core.get.call(null,map__7081__$1,new cljs.core.Keyword(null,"frame","frame",1111596255));var stack__$1 = cljs.core.get.call(null,map__7081__$1,new cljs.core.Keyword(null,"stack","stack",1123661306));var failed_step = cljs.core.first.call(null,cljs.core.remove.call(null,((function (v,map__7081,map__7081__$1,frame,stack__$1){
return (function (x){return (frame.vars[[cljs.core.str("value_"),cljs.core.str(x)].join('')]);
});})(v,map__7081,map__7081__$1,frame,stack__$1))
,cljs.core.get_in.call(null,index,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [cljs.core.second.call(null,cljs.core.last.call(null,stack__$1)),new cljs.core.Keyword(null,"steps","steps",1123665561)], null))));var stack__$2 = cljs.core.reverse.call(null,cljs.core.concat.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"notebook","notebook",2595460429),new cljs.core.Keyword(null,"id","id",1013907597).cljs$core$IFn$_invoke$arity$1(notebook)], null)], null),stack__$1,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"step","step",1017444926),failed_step], null)], null)));cljs.core.println.call(null,"ERROR STACK: ",stack__$2,e);
aurora.editor.ui.assoc_cache_BANG_.call(null,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.Keyword(null,"error","error",1110689146)], null),new cljs.core.PersistentArrayMap(null, 2, [new cljs.core.Keyword(null,"stack","stack",1123661306),stack__$2,new cljs.core.Keyword(null,"exception","exception",2495529921),e], null));
document.getElementById("run-perf").innerHTML = (aurora.editor.ui.now.call(null) - start__$1);
return v;
}} else
{return null;
}
});
aurora.editor.ui.re_run = (function re_run(notebook,page,args){if(cljs.core.truth_((function (){var and__3345__auto__ = notebook;if(cljs.core.truth_(and__3345__auto__))
{return page;
} else
{return and__3345__auto__;
}
})()))
{var run = aurora.editor.ui.run_index.call(null,new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cljs.core.deref.call(null,aurora.editor.core.aurora_state)),cljs.core.deref.call(null,notebook),cljs.core.deref.call(null,page),args);cljs.core.reset_BANG_.call(null,aurora.editor.ui.cur_state,cljs.core.second.call(null,run));
cljs.core.reset_BANG_.call(null,aurora.editor.ui.run_stack,{"calls": [cljs.core.nth.call(null,run,2)]});
return aurora.editor.ui.queue_render.call(null);
} else
{return null;
}
});
aurora.editor.ui.find_id = (function find_id(thing,id){return cljs.core.first.call(null,cljs.core.filter.call(null,(function (p1__7082_SHARP_){return cljs.core._EQ_.call(null,(p1__7082_SHARP_["id"]),id);
}),(thing["calls"])));
});
aurora.editor.ui.traverse_path = (function traverse_path(stack,path,last_frame_QMARK_){var stack__$1 = stack;var path__$1 = path;while(true){
if(cljs.core.truth_(stack__$1))
{if(cljs.core.not.call(null,path__$1))
{return stack__$1;
} else
{{
var G__7083 = aurora.editor.ui.find_id.call(null,stack__$1,cljs.core.second.call(null,cljs.core.first.call(null,path__$1)));
var G__7084 = cljs.core.next.call(null,path__$1);
stack__$1 = G__7083;
path__$1 = G__7084;
continue;
}
}
} else
{return null;
}
break;
}
});
aurora.editor.ui.path__GT_frame = (function path__GT_frame(path){return aurora.editor.ui.traverse_path.call(null,cljs.core.deref.call(null,aurora.editor.ui.run_stack),cljs.core.filter.call(null,(function (p1__7085_SHARP_){return cljs.core._EQ_.call(null,cljs.core.first.call(null,p1__7085_SHARP_),new cljs.core.Keyword(null,"page","page",1017337345));
}),cljs.core.reverse.call(null,path)));
});
aurora.editor.ui.path__GT_match_branch = (function path__GT_match_branch(path){var temp__4092__auto__ = aurora.editor.ui.path__GT_frame.call(null,path);if(cljs.core.truth_(temp__4092__auto__))
{var frame = temp__4092__auto__;return ((frame["matches"])[[cljs.core.str("value_"),cljs.core.str(cljs.core.second.call(null,cljs.core.first.call(null,path)))].join('')]);
} else
{return null;
}
});
aurora.editor.ui.path__GT_result = (function path__GT_result(path){var temp__4092__auto__ = aurora.editor.ui.path__GT_frame.call(null,path);if(cljs.core.truth_(temp__4092__auto__))
{var frame = temp__4092__auto__;return ((frame["vars"])[[cljs.core.str("value_"),cljs.core.str(cljs.core.second.call(null,cljs.core.first.call(null,path)))].join('')]);
} else
{return null;
}
});
cljs.core.add_watch.call(null,aurora.editor.core.aurora_state,new cljs.core.Keyword(null,"running","running",2564688177),(function (_,___$1,___$2,cur){if(!((aurora.editor.ui.prev === new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cur))))
{aurora.editor.ui.prev = new cljs.core.Keyword(null,"index","index",1114250308).cljs$core$IFn$_invoke$arity$1(cur);
return aurora.editor.ui.re_run.call(null,aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"notebook","notebook",2595460429)),aurora.editor.ui.current.call(null,new cljs.core.Keyword(null,"page","page",1017337345)),cljs.core.deref.call(null,aurora.editor.ui.cur_state));
} else
{return null;
}
}));
aurora.editor.ui.queued_QMARK_ = false;
aurora.editor.ui.RAF = requestAnimationFrame;
aurora.editor.ui.update = (function update(){var start = aurora.editor.ui.now.call(null);React.renderComponent(aurora.editor.ui.aurora_ui.call(null),document.getElementById("wrapper"));
aurora.editor.ui.focus_BANG_.call(null);
document.getElementById("render-perf").innerHTML = (aurora.editor.ui.now.call(null) - start);
return aurora.editor.ui.queued_QMARK_ = false;
});
aurora.editor.ui.queue_render = (function queue_render(){if(cljs.core.truth_(aurora.editor.ui.queued_QMARK_))
{return null;
} else
{aurora.editor.ui.queued_QMARK_ = true;
return aurora.editor.ui.RAF.call(null,aurora.editor.ui.update);
}
});
cljs.core.add_watch.call(null,aurora.editor.core.aurora_state,new cljs.core.Keyword(null,"foo","foo",1014005816),(function (_,___$1,___$2,cur){return aurora.editor.ui.queue_render.call(null);
}));
aurora.util.dom.on.call(null,document,new cljs.core.Keyword(null,"keydown","keydown",4493897459),(function (e){if(cljs.core._EQ_.call(null,"INPUT",e.target.tagName))
{return aurora.util.dom.css.call(null,e.target,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"width","width",1127031096),(10 * cljs.core.count.call(null,e.target.value))], null));
} else
{return null;
}
}));
aurora.util.dom.on.call(null,document,new cljs.core.Keyword(null,"input","input",1114262332),(function (e){if(cljs.core._EQ_.call(null,"INPUT",e.target.tagName))
{return aurora.util.dom.css.call(null,e.target,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"width","width",1127031096),(10 * cljs.core.count.call(null,e.target.value))], null));
} else
{return null;
}
}));
aurora.util.dom.on.call(null,document,new cljs.core.Keyword(null,"change","change",3947235106),(function (e){if(cljs.core._EQ_.call(null,"INPUT",e.target.tagName))
{return aurora.util.dom.css.call(null,e.target,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"width","width",1127031096),(10 * cljs.core.count.call(null,e.target.value))], null));
} else
{return null;
}
}));
aurora.util.dom.on.call(null,document,new cljs.core.Keyword(null,"keyup","keyup",1115849900),(function (e){if(cljs.core._EQ_.call(null,"INPUT",e.target.tagName))
{return aurora.util.dom.css.call(null,e.target,new cljs.core.PersistentArrayMap(null, 1, [new cljs.core.Keyword(null,"width","width",1127031096),(10 * cljs.core.count.call(null,e.target.value))], null));
} else
{return null;
}
}));
aurora.editor.ui.focus_BANG_ = (function focus_BANG_(){var temp__4092__auto__ = cljs.core.last.call(null,aurora.util.dom.$$.call(null,new cljs.core.Keyword(null,".focused",".focused",3182726907)));if(cljs.core.truth_(temp__4092__auto__))
{var cur = temp__4092__auto__;return cur.focus();
} else
{return null;
}
});
aurora.editor.ui.repopulate.call(null);
