macro foreach {
  // foreach(value of list), foreach(value of [1,...,n])
  rule {($x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    for (var i = 0; i < list.length; i++) {
      var $x = list[i];
      $line ...
    }
  }
  // foreach(ix, value of list), foreach(ix, value of [1,...,n])
  rule {($ix:ident, $x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    for (var $ix = 0; $ix < list.length; $ix++) {
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
    for(var i = 0, len = keys.length; i < len; i++) {
      var $ix = keys[i];
      $line ...
    }
  }
  // forattr(ix, value of object)
  rule {($ix:ident, $x:ident of $obj:expr) { $line ... }} => {
    var obj = $obj;
    var keys = Object.keys(obj);
    for(var i = 0, len = keys.length; i < len; i++) {
      var $ix = keys[i];
      var $x = obj[$ix];
      $line ...
    }
  }
}
export forattr

macro factToId {
  rule {($fact:expr)} => {
    JSON.stringify($fact);
  }
}
export factToId

macro unpack {
  rule {[$name:ident (,) ...] = $expr} => {
    var e = $expr;
    var i = 0
    $(; var $name = e[i++]) ...
  }
}
export unpack
