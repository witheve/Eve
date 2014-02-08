// Compiled by ClojureScript .
goog.provide('aurora.runtime.table');
goog.require('cljs.core');
aurora.runtime.table.ITable = (function (){var obj7087 = {};return obj7087;
})();
aurora.runtime.table._add_column = (function _add_column(this$,header,column){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_add_column$arity$3;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_add_column$arity$3(this$,header,column);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._add_column[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._add_column["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-add-column",this$);
}
}
})().call(null,this$,header,column);
}
});
aurora.runtime.table._select_column = (function _select_column(this$,column_id){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_select_column$arity$2;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_select_column$arity$2(this$,column_id);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._select_column[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._select_column["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-select-column",this$);
}
}
})().call(null,this$,column_id);
}
});
aurora.runtime.table._columns = (function _columns(this$){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_columns$arity$1;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_columns$arity$1(this$);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._columns[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._columns["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-columns",this$);
}
}
})().call(null,this$);
}
});
aurora.runtime.table._column_headers = (function _column_headers(this$){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_column_headers$arity$1;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_column_headers$arity$1(this$);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._column_headers[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._column_headers["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-column-headers",this$);
}
}
})().call(null,this$);
}
});
aurora.runtime.table._rows = (function _rows(this$){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_rows$arity$1;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_rows$arity$1(this$);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._rows[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._rows["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-rows",this$);
}
}
})().call(null,this$);
}
});
aurora.runtime.table._add_row = (function _add_row(this$,row){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_add_row$arity$2;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_add_row$arity$2(this$,row);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._add_row[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._add_row["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-add-row",this$);
}
}
})().call(null,this$,row);
}
});
aurora.runtime.table._select_row = (function _select_row(this$,row_id){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_select_row$arity$2;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_select_row$arity$2(this$,row_id);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._select_row[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._select_row["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-select-row",this$);
}
}
})().call(null,this$,row_id);
}
});
aurora.runtime.table._cell = (function _cell(this$,row,col){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_cell$arity$3;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_cell$arity$3(this$,row,col);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._cell[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._cell["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-cell",this$);
}
}
})().call(null,this$,row,col);
}
});
aurora.runtime.table._update_cell = (function _update_cell(this$,row,col,func){if((function (){var and__3345__auto__ = this$;if(and__3345__auto__)
{return this$.aurora$runtime$table$ITable$_update_cell$arity$4;
} else
{return and__3345__auto__;
}
})())
{return this$.aurora$runtime$table$ITable$_update_cell$arity$4(this$,row,col,func);
} else
{var x__3965__auto__ = (((this$ == null))?null:this$);return (function (){var or__3357__auto__ = (aurora.runtime.table._update_cell[goog.typeOf(x__3965__auto__)]);if(or__3357__auto__)
{return or__3357__auto__;
} else
{var or__3357__auto____$1 = (aurora.runtime.table._update_cell["_"]);if(or__3357__auto____$1)
{return or__3357__auto____$1;
} else
{throw cljs.core.missing_protocol.call(null,"ITable.-update-cell",this$);
}
}
})().call(null,this$,row,col,func);
}
});
aurora.runtime.table.apply_columns = (function apply_columns(row,row_num,columns){return cljs.core.reduce.call(null,(function (final$,i){var temp__4090__auto__ = cljs.core.get.call(null,columns,i);if(cljs.core.truth_(temp__4090__auto__))
{var func = temp__4090__auto__;return cljs.core.assoc.call(null,final$,i,func.call(null,final$,row_num));
} else
{return final$;
}
}),row,cljs.core.range.call(null,cljs.core.count.call(null,columns)));
});

/**
* @constructor
*/
aurora.runtime.table.NaiveTable = (function (headers,columns,rows){
this.headers = headers;
this.columns = columns;
this.rows = rows;
this.cljs$lang$protocol_mask$partition1$ = 0;
this.cljs$lang$protocol_mask$partition0$ = 2147483648;
})
aurora.runtime.table.NaiveTable.cljs$lang$type = true;
aurora.runtime.table.NaiveTable.cljs$lang$ctorStr = "aurora.runtime.table/NaiveTable";
aurora.runtime.table.NaiveTable.cljs$lang$ctorPrWriter = (function (this__3906__auto__,writer__3907__auto__,opt__3908__auto__){return cljs.core._write.call(null,writer__3907__auto__,"aurora.runtime.table/NaiveTable");
});
aurora.runtime.table.NaiveTable.prototype.cljs$core$IPrintWithWriter$_pr_writer$arity$3 = (function (this$,writer,opts){var self__ = this;
var this$__$1 = this;return cljs.core._write.call(null,writer,[cljs.core.str(cljs.core.apply.call(null,cljs.core.str,cljs.core.interpose.call(null," | ",self__.headers))),cljs.core.str("\n"),cljs.core.str(cljs.core.apply.call(null,cljs.core.str,cljs.core.interpose.call(null,"\n",cljs.core.map.call(null,cljs.core.pr_str,self__.rows))))].join(''));
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$ = true;
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_select_row$arity$2 = (function (this$,row_id){var self__ = this;
var this$__$1 = this;return (new aurora.runtime.table.NaiveTable(self__.headers,self__.columns,new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [cljs.core.get.call(null,self__.rows,row_id)], null)));
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_column_headers$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return self__.headers;
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_update_cell$arity$4 = (function (this$,row,col,func){var self__ = this;
var this$__$1 = this;return (new aurora.runtime.table.NaiveTable(self__.headers,self__.columns,cljs.core.assoc.call(null,self__.rows,row,aurora.runtime.table.apply_columns.call(null,cljs.core.update_in.call(null,cljs.core.get.call(null,self__.rows,row),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [col], null),func),cljs.core.count.call(null,self__.rows),self__.columns))));
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_columns$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return self__.columns;
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_add_row$arity$2 = (function (this$,row){var self__ = this;
var this$__$1 = this;return (new aurora.runtime.table.NaiveTable(self__.headers,self__.columns,cljs.core.conj.call(null,self__.rows,aurora.runtime.table.apply_columns.call(null,row,cljs.core.count.call(null,self__.rows),self__.columns))));
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_cell$arity$3 = (function (this$,row,col){var self__ = this;
var this$__$1 = this;return cljs.core.get_in.call(null,self__.rows,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [row,col], null));
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_add_column$arity$3 = (function (this$,header,column){var self__ = this;
var this$__$1 = this;if(cljs.core.not.call(null,column))
{var cur_count = cljs.core.count.call(null,self__.columns);return (new aurora.runtime.table.NaiveTable(cljs.core.conj.call(null,self__.headers,header),cljs.core.conj.call(null,self__.columns,(function (p1__7088_SHARP_){return cljs.core.get.call(null,p1__7088_SHARP_,cur_count);
})),(function (){var xs__4735__auto__ = self__.rows;var func__4736__auto__ = ((function (xs__4735__auto__){
return (function (row,index){return cljs.core.conj.call(null,row,null);
});})(xs__4735__auto__))
;var len__4737__auto__ = cljs.core.count.call(null,xs__4735__auto__);var index__4738__auto__ = 0;var final__4739__auto__ = cljs.core.transient$.call(null,cljs.core.PersistentVector.EMPTY);while(true){
if(!((index__4738__auto__ < len__4737__auto__)))
{return cljs.core.persistent_BANG_.call(null,final__4739__auto__);
} else
{{
var G__7090 = (index__4738__auto__ + 1);
var G__7091 = cljs.core.conj_BANG_.call(null,final__4739__auto__,func__4736__auto__.call(null,xs__4735__auto__.call(null,index__4738__auto__),index__4738__auto__));
index__4738__auto__ = G__7090;
final__4739__auto__ = G__7091;
continue;
}
}
break;
}
})()));
} else
{return (new aurora.runtime.table.NaiveTable(cljs.core.conj.call(null,self__.headers,header),cljs.core.conj.call(null,self__.columns,column),(function (){var xs__4735__auto__ = self__.rows;var func__4736__auto__ = ((function (xs__4735__auto__){
return (function (row,i){return cljs.core.conj.call(null,row,column.call(null,row,i));
});})(xs__4735__auto__))
;var len__4737__auto__ = cljs.core.count.call(null,xs__4735__auto__);var index__4738__auto__ = 0;var final__4739__auto__ = cljs.core.transient$.call(null,cljs.core.PersistentVector.EMPTY);while(true){
if(!((index__4738__auto__ < len__4737__auto__)))
{return cljs.core.persistent_BANG_.call(null,final__4739__auto__);
} else
{{
var G__7092 = (index__4738__auto__ + 1);
var G__7093 = cljs.core.conj_BANG_.call(null,final__4739__auto__,func__4736__auto__.call(null,xs__4735__auto__.call(null,index__4738__auto__),index__4738__auto__));
index__4738__auto__ = G__7092;
final__4739__auto__ = G__7093;
continue;
}
}
break;
}
})()));
}
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_rows$arity$1 = (function (this$){var self__ = this;
var this$__$1 = this;return self__.rows;
});
aurora.runtime.table.NaiveTable.prototype.aurora$runtime$table$ITable$_select_column$arity$2 = (function (this$,column_id){var self__ = this;
var this$__$1 = this;return (new aurora.runtime.table.NaiveTable(new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [cljs.core.get.call(null,self__.headers,column_id)], null),new cljs.core.PersistentVector(null, 1, 5, cljs.core.PersistentVector.EMPTY_NODE, [cljs.core.get.call(null,self__.columns,column_id)], null),cljs.core.mapv.call(null,(function (p1__7089_SHARP_){return cljs.core.get.call(null,p1__7089_SHARP_,column_id);
}),self__.rows)));
});
aurora.runtime.table.__GT_NaiveTable = (function __GT_NaiveTable(headers,columns,rows){return (new aurora.runtime.table.NaiveTable(headers,columns,rows));
});
aurora.runtime.table.identity_column = null;
aurora.runtime.table.table_headers = new cljs.core.PersistentVector(null, 16, 5, cljs.core.PersistentVector.EMPTY_NODE, ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"], null);
aurora.runtime.table.table = (function() {
var table = null;
var table__0 = (function (){return (new aurora.runtime.table.NaiveTable(cljs.core.PersistentVector.EMPTY,cljs.core.PersistentVector.EMPTY,cljs.core.PersistentVector.EMPTY));
});
var table__1 = (function (headers){return (new aurora.runtime.table.NaiveTable(headers,cljs.core.vec.call(null,cljs.core.repeat.call(null,cljs.core.count.call(null,headers),null)),cljs.core.PersistentVector.EMPTY));
});
var table__2 = (function (headers,columns){return (new aurora.runtime.table.NaiveTable(headers,columns,cljs.core.PersistentVector.EMPTY));
});
var table__3 = (function (headers,columns,rows){return (new aurora.runtime.table.NaiveTable(headers,columns,rows));
});
table = function(headers,columns,rows){
switch(arguments.length){
case 0:
return table__0.call(this);
case 1:
return table__1.call(this,headers);
case 2:
return table__2.call(this,headers,columns);
case 3:
return table__3.call(this,headers,columns,rows);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
table.cljs$core$IFn$_invoke$arity$0 = table__0;
table.cljs$core$IFn$_invoke$arity$1 = table__1;
table.cljs$core$IFn$_invoke$arity$2 = table__2;
table.cljs$core$IFn$_invoke$arity$3 = table__3;
return table;
})()
;
aurora.runtime.table.rows__GT_table = (function rows__GT_table(rows){var column_count = cljs.core.count.call(null,cljs.core.first.call(null,rows));return aurora.runtime.table.table.call(null,cljs.core.subvec.call(null,aurora.runtime.table.table_headers,0,column_count),cljs.core.vec.call(null,cljs.core.repeat.call(null,column_count,null)),rows);
});
aurora.runtime.table.merge_rows = (function merge_rows(t1,t2){return aurora.runtime.table.table.call(null,aurora.runtime.table._column_headers.call(null,t1),aurora.runtime.table._columns.call(null,t1),cljs.core.vec.call(null,cljs.core.concat.call(null,aurora.runtime.table._rows.call(null,t1),aurora.runtime.table._rows.call(null,t2))));
});
aurora.runtime.table.add_column = (function() {
var add_column = null;
var add_column__1 = (function (t){return aurora.runtime.table._add_columns.call(null,t,cljs.core.get.call(null,aurora.runtime.table.header,cljs.core.count.call(null,aurora.runtime.table._columns.call(null,t)),null));
});
var add_column__2 = (function (t,header){return aurora.runtime.table._add_column.call(null,t,header,null);
});
var add_column__3 = (function (t,header,func){return aurora.runtime.table._add_column.call(null,t,header,func);
});
add_column = function(t,header,func){
switch(arguments.length){
case 1:
return add_column__1.call(this,t);
case 2:
return add_column__2.call(this,t,header);
case 3:
return add_column__3.call(this,t,header,func);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
add_column.cljs$core$IFn$_invoke$arity$1 = add_column__1;
add_column.cljs$core$IFn$_invoke$arity$2 = add_column__2;
add_column.cljs$core$IFn$_invoke$arity$3 = add_column__3;
return add_column;
})()
;
aurora.runtime.table.add_row = (function add_row(t,row){return aurora.runtime.table._add_row.call(null,t,row);
});
aurora.runtime.table.row = (function row(t,row_num){return aurora.runtime.table._select_row.call(null,t,row_num);
});
aurora.runtime.table.update_cell = (function update_cell(t,row,col,func){return aurora.runtime.table._update_cell.call(null,t,row,col,func);
});
aurora.runtime.table.cell = (function cell(t,row,col){return aurora.runtime.table._cell.call(null,t,row,col);
});
aurora.runtime.table.column = (function column(t,column_num){return aurora.runtime.table._column.call(null,t,aurora.runtime.table.column_name);
});
aurora.runtime.table.headers = (function headers(t){return aurora.runtime.table._column_headers.call(null,t);
});
aurora.runtime.table.map_table = (function map_table(func,t){var cols = aurora.runtime.table._columns.call(null,t);return aurora.runtime.table.table.call(null,aurora.runtime.table.headers.call(null,t),cols,(function (){var xs__4735__auto__ = aurora.runtime.table._rows.call(null,t);var func__4736__auto__ = ((function (xs__4735__auto__){
return (function (row,index){return aurora.runtime.table.apply_columns.call(null,func.call(null,row,index),index,cols);
});})(xs__4735__auto__))
;var len__4737__auto__ = cljs.core.count.call(null,xs__4735__auto__);var index__4738__auto__ = 0;var final__4739__auto__ = cljs.core.transient$.call(null,cljs.core.PersistentVector.EMPTY);while(true){
if(!((index__4738__auto__ < len__4737__auto__)))
{return cljs.core.persistent_BANG_.call(null,final__4739__auto__);
} else
{{
var G__7094 = (index__4738__auto__ + 1);
var G__7095 = cljs.core.conj_BANG_.call(null,final__4739__auto__,func__4736__auto__.call(null,xs__4735__auto__.call(null,index__4738__auto__),index__4738__auto__));
index__4738__auto__ = G__7094;
final__4739__auto__ = G__7095;
continue;
}
}
break;
}
})());
});
aurora.runtime.table._add_column.call(null,aurora.runtime.table.rows__GT_table.call(null,new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [1,2], null),new cljs.core.PersistentVector(null, 2, 5, cljs.core.PersistentVector.EMPTY_NODE, [3,4], null)], null)),"woo",(function (row,i){return (cljs.core.get.call(null,row,0) + cljs.core.get.call(null,row,1));
}));
