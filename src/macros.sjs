macro foreach {
  // foreach(value of list), foreach(value of [1,...,n])
  rule {($x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    var len = list && list.length || 0;
    for (var i = 0; i < len; i++) {
      var $x = list[i];
      $line ...
    }
  }
  // foreach(ix, value of list), foreach(ix, value of [1,...,n])
  rule {($ix:ident, $x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    var len = list && list.length || 0;
    for (var $ix = 0; $ix < len; $ix++) {
      var $x = list[$ix];
      $line ...
    }
  }
}
export foreach

// Optimized for performance with large numbers of keys (N > 20).
// For smaller numbers of keys, just use for...in.
macro forattr {
  // forattr(ix of object)
  rule {($ix:ident of $obj:expr) { $line ... }} => {
    var obj = $obj;
    var keys = Object.keys(obj);
    var len = keys.length;
    for(var i = 0; i < len; i++) {
      var $ix = keys[i];
      $line ...
    }
  }
  // forattr(ix, value of object)
  rule {($ix:ident, $x:ident of $obj:expr) { $line ... }} => {
    var obj = $obj;
    var keys = Object.keys(obj);
    var len = keys.length;
    for(var i = 0; i < len; i++) {
      var $ix = keys[i];
      var $x = obj[$ix];
      $line ...
    }
  }
}
export forattr

macro unpack {
  rule {[$name:ident (,) ...] = $expr} => {
    var e = $expr;
    var i = 0
    $(; var $name = e[i++]) ...
  }
}
export unpack
