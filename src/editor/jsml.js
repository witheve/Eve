import macros from "../macros.sjs";
var React = require("react/addons");

var JSML = module.exports = {
  parse: function(jsml) {
    if(!jsml || !jsml.length) { return undefined; }

    var tag = jsml[0];
    var el = document.createElement(tag);
    var childIx = 1;
    // If second item is not an array and is an object, it's an attribute hash.
    if(jsml[1] && !jsml[1].length && typeof jsml[1] === "object" &&
       !(jsml[1] instanceof Element || jsml[1] instanceof Node)) {

      forattr(key, val of jsml[1]) {
        // handle style object special case.
        if(key === "style" && typeof val === "object") {
          forattr(prop, cssVal of val) {
            el.style[prop] = cssVal;
          }
        } else if(typeof val === "function") {
          el.addEventListener(key, val);
        } else {
          el.setAttribute(key, val);
        }
      }
      childIx = 2; // Skip attribute hash when considering children.
    }

    // Remaining strings / arrays are children.
    foreach(ix, child of jsml) {
      if(ix < childIx || !child) { continue; }

      if(child instanceof Element || child instanceof Node) {
        el.appendChild(child);
      } else if(child.length && typeof child !== "string") {
        el.appendChild(JSML.parse(child));
      } else {
        el.appendChild(document.createTextNode(child));
      }
    }

    return el;
  },
  react: function(jsml) {
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
    foreach(ix, child of jsml) {
      if(ix < childIx || !child) { continue; }

      if(child.constructor === Array && child.length) {
        if(typeof child[0] === "string") {
          children.push(JSML.react(child));
        } else {
          subChildren = child.map(JSML.react);
          foreach(subChild of subChildren) {
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
};


["div" ["span"]]
["div" [["span"] ["span"]]]
