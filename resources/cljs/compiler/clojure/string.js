// Compiled by ClojureScript .
goog.provide('clojure.string');
goog.require('cljs.core');
goog.require('goog.string.StringBuffer');
goog.require('goog.string.StringBuffer');
goog.require('goog.string');
goog.require('goog.string');
clojure.string.seq_reverse = (function seq_reverse(coll){return cljs.core.reduce.call(null,cljs.core.conj,cljs.core.List.EMPTY,coll);
});
/**
* Returns s with its characters reversed.
*/
clojure.string.reverse = (function reverse(s){return s.split("").reverse().join("");
});
/**
* Replaces all instance of match with replacement in s.
* match/replacement can be:
* 
* string / string
* pattern / (string or function of match).
*/
clojure.string.replace = (function replace(s,match,replacement){if(typeof match === 'string')
{return s.replace((new RegExp(goog.string.regExpEscape(match),"g")),replacement);
} else
{if(cljs.core.truth_(match.hasOwnProperty("source")))
{return s.replace((new RegExp(match.source,"g")),replacement);
} else
{if(new cljs.core.Keyword(null,"else","else",1017020587))
{throw [cljs.core.str("Invalid match arg: "),cljs.core.str(match)].join('');
} else
{return null;
}
}
}
});
/**
* Replaces the first instance of match with replacement in s.
* match/replacement can be:
* 
* string / string
* pattern / (string or function of match).
*/
clojure.string.replace_first = (function replace_first(s,match,replacement){return s.replace(match,replacement);
});
/**
* Returns a string of all elements in coll, as returned by (seq coll),
* separated by an optional separator.
*/
clojure.string.join = (function() {
var join = null;
var join__1 = (function (coll){return cljs.core.apply.call(null,cljs.core.str,coll);
});
var join__2 = (function (separator,coll){return cljs.core.apply.call(null,cljs.core.str,cljs.core.interpose.call(null,separator,coll));
});
join = function(separator,coll){
switch(arguments.length){
case 1:
return join__1.call(this,separator);
case 2:
return join__2.call(this,separator,coll);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
join.cljs$core$IFn$_invoke$arity$1 = join__1;
join.cljs$core$IFn$_invoke$arity$2 = join__2;
return join;
})()
;
/**
* Converts string to all upper-case.
*/
clojure.string.upper_case = (function upper_case(s){return s.toUpperCase();
});
/**
* Converts string to all lower-case.
*/
clojure.string.lower_case = (function lower_case(s){return s.toLowerCase();
});
/**
* Converts first character of the string to upper-case, all other
* characters to lower-case.
*/
clojure.string.capitalize = (function capitalize(s){if((cljs.core.count.call(null,s) < 2))
{return clojure.string.upper_case.call(null,s);
} else
{return [cljs.core.str(clojure.string.upper_case.call(null,cljs.core.subs.call(null,s,0,1))),cljs.core.str(clojure.string.lower_case.call(null,cljs.core.subs.call(null,s,1)))].join('');
}
});
clojure.string.pop_last_while_empty = (function pop_last_while_empty(v){var v__$1 = v;while(true){
if(cljs.core._EQ_.call(null,"",cljs.core.peek.call(null,v__$1)))
{{
var G__12051 = cljs.core.pop.call(null,v__$1);
v__$1 = G__12051;
continue;
}
} else
{return v__$1;
}
break;
}
});
clojure.string.discard_trailing_if_needed = (function discard_trailing_if_needed(limit,v){if(cljs.core._EQ_.call(null,0,limit))
{return clojure.string.pop_last_while_empty.call(null,v);
} else
{return v;
}
});
clojure.string.split_with_empty_regex = (function split_with_empty_regex(s,limit){if(((limit <= 0)) || ((limit >= (2 + cljs.core.count.call(null,s)))))
{return cljs.core.conj.call(null,cljs.core.vec.call(null,cljs.core.cons.call(null,"",cljs.core.map.call(null,cljs.core.str,cljs.core.seq.call(null,s)))),"");
} else
{var pred__12055 = cljs.core._EQ_;var expr__12056 = limit;if(cljs.core.truth_(pred__12055.call(null,1,expr__12056)))
{return (new cljs.core.PersistentVector(null,1,5,cljs.core.PersistentVector.EMPTY_NODE,[s],null));
} else
{if(cljs.core.truth_(pred__12055.call(null,2,expr__12056)))
{return (new cljs.core.PersistentVector(null,2,5,cljs.core.PersistentVector.EMPTY_NODE,["",s],null));
} else
{var c = (limit - 2);return cljs.core.conj.call(null,cljs.core.vec.call(null,cljs.core.cons.call(null,"",cljs.core.subvec.call(null,cljs.core.vec.call(null,cljs.core.map.call(null,cljs.core.str,cljs.core.seq.call(null,s))),0,c))),cljs.core.subs.call(null,s,c));
}
}
}
});
/**
* Splits string on a regular expression. Optional argument limit is
* the maximum number of splits. Not lazy. Returns vector of the splits.
*/
clojure.string.split = (function() {
var split = null;
var split__2 = (function (s,re){return split.call(null,s,re,0);
});
var split__3 = (function (s,re,limit){return clojure.string.discard_trailing_if_needed.call(null,limit,((cljs.core._EQ_.call(null,[cljs.core.str(re)].join(''),"/(?:)/"))?clojure.string.split_with_empty_regex.call(null,s,limit):(((limit < 1))?cljs.core.vec.call(null,[cljs.core.str(s)].join('').split(re)):(function (){var s__$1 = s;var limit__$1 = limit;var parts = cljs.core.PersistentVector.EMPTY;while(true){
if(cljs.core._EQ_.call(null,limit__$1,1))
{return cljs.core.conj.call(null,parts,s__$1);
} else
{var temp__4090__auto__ = cljs.core.re_find.call(null,re,s__$1);if(cljs.core.truth_(temp__4090__auto__))
{var m = temp__4090__auto__;var index = s__$1.indexOf(m);{
var G__12058 = s__$1.substring((index + cljs.core.count.call(null,m)));
var G__12059 = (limit__$1 - 1);
var G__12060 = cljs.core.conj.call(null,parts,s__$1.substring(0,index));
s__$1 = G__12058;
limit__$1 = G__12059;
parts = G__12060;
continue;
}
} else
{return cljs.core.conj.call(null,parts,s__$1);
}
}
break;
}
})())));
});
split = function(s,re,limit){
switch(arguments.length){
case 2:
return split__2.call(this,s,re);
case 3:
return split__3.call(this,s,re,limit);
}
throw(new Error('Invalid arity: ' + arguments.length));
};
split.cljs$core$IFn$_invoke$arity$2 = split__2;
split.cljs$core$IFn$_invoke$arity$3 = split__3;
return split;
})()
;
/**
* Splits s on
* or
* .
*/
clojure.string.split_lines = (function split_lines(s){return clojure.string.split.call(null,s,/\n|\r\n/);
});
/**
* Removes whitespace from both ends of string.
*/
clojure.string.trim = (function trim(s){return goog.string.trim(s);
});
/**
* Removes whitespace from the left side of string.
*/
clojure.string.triml = (function triml(s){return goog.string.trimLeft(s);
});
/**
* Removes whitespace from the right side of string.
*/
clojure.string.trimr = (function trimr(s){return goog.string.trimRight(s);
});
/**
* Removes all trailing newline \n or return \r characters from
* string.  Similar to Perl's chomp.
*/
clojure.string.trim_newline = (function trim_newline(s){var index = s.length;while(true){
if((index === 0))
{return "";
} else
{var ch = cljs.core.get.call(null,s,(index - 1));if((cljs.core._EQ_.call(null,ch,"\n")) || (cljs.core._EQ_.call(null,ch,"\r")))
{{
var G__12061 = (index - 1);
index = G__12061;
continue;
}
} else
{return s.substring(0,index);
}
}
break;
}
});
/**
* True is s is nil, empty, or contains only whitespace.
*/
clojure.string.blank_QMARK_ = (function blank_QMARK_(s){return goog.string.isEmptySafe(s);
});
/**
* Return a new string, using cmap to escape each character ch
* from s as follows:
* 
* If (cmap ch) is nil, append ch to the new string.
* If (cmap ch) is non-nil, append (str (cmap ch)) instead.
*/
clojure.string.escape = (function escape__$1(s,cmap){var buffer = (new goog.string.StringBuffer());var length = s.length;var index = 0;while(true){
if(cljs.core._EQ_.call(null,length,index))
{return buffer.toString();
} else
{var ch = s.charAt(index);var temp__4090__auto___12062 = cljs.core.get.call(null,cmap,ch);if(cljs.core.truth_(temp__4090__auto___12062))
{var replacement_12063 = temp__4090__auto___12062;buffer.append([cljs.core.str(replacement_12063)].join(''));
} else
{buffer.append(ch);
}
{
var G__12064 = (index + 1);
index = G__12064;
continue;
}
}
break;
}
});
