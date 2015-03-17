function JSML(jsml) {
  if(!jsml || !jsml.length) { return jsml; }

  var tag = jsml[0];
  var attrs = {};
  var childIx = 1;
  var children = [];
  var subChildren;
  // If second item is not an array and is an object, it's an attribute hash.
  if(jsml[1] && !jsml[1].length && typeof jsml[1] === "object" && !React.isValidElement(jsml[1])) {
    attrs = jsml[1];
    childIx++;
  }

  // Remaining strings / arrays are children.
  for(var ix = 0, len = jsml.length; ix < len; ix++) {
    var child = jsml[ix];
    if(ix < childIx || child === undefined) { continue; }

    if(child.constructor === Array && child.length) {
      if(typeof child[0] === "string" || typeof child[0] === "function") {
        children.push(JSML(child));
      } else {
        subChildren = child.map(function(cur) { return JSML(cur); });
        for(var subIx = 0, subLen = subChildren.length; subIx < subLen; subIx++) {
          var subChild = subChildren[subIx];
          children.push(subChild);
        }
      }
    } else {
      children.push(child);
    }
  }

  if(children.length) {
    return React.createElement(tag, attrs, children);
  }
  return React.createElement(tag, attrs);
}
