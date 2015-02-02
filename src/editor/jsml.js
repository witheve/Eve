import macros from "../macros.sjs";

var JSML = module.exports = {
  parse: function(jsml) {
    if(!jsml || !jsml.length) { return undefined; }

    var tag = jsml[0];
    var el = document.createElement(tag);
    var childIx = 1;
    // If second item is not an array and is an object, it's an attribute hash.
    if(jsml[1] && !jsml[1].length && typeof jsml[1] === "object") {
      forattr(key, val of jsml[1]) {
        el.setAttribute(key, val);
      }
      childIx = 2; // Skip attribute hash when considering children.
    }

    // Remaining strings / arrays are children.
    foreach(ix, child of jsml) {
      if(ix < childIx || !child) { continue; }

      if(child.length && typeof child !== "string") {
        el.appendChild(JSML.parse(child));
      } else {
        el.appendChild(document.createTextNode(child));
      }
    }

    return el;
  }
};
