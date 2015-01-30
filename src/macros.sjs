macro foreach {
  // foreach(x of list), foreach(x of [1,...,n])
  rule {($x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    for (var i = 0; i < list.length; i++) {
      var $x = list[i];
      $line ...
    }
  }
  // foreach(ix, x of list), foreach(ix, x of [1,...,n])
  rule {($ix:ident, $x:ident of $list:expr) { $line ... }} => {
    var list = $list;
    for (var $ix = 0; $ix < list.length; $ix++) {
      var $x = list[$ix];
      $line ...
    }
  }
}

export foreach
