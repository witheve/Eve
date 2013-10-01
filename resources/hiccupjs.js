var test = ["div", {"class": "foo"},
            ["ul", [["li", "foo"], ["li", "bar"]]],
            ["button", {"click": function() {}}, "increment"],
            ["span", 234]];

var re_tag = /([^\s\.#]+)(?:#([^\s\.#]+))?(?:\.([^\s#]+))?/;

var handlers = {
  "click": true,
  "dblclick": true,
  "contextmenu": true,
  "mousedown": true,
  "mouseup": true,
  "mouseover": true,
  "mousemove": true,
  "mouseout": true,
  "dragstart": true,
  "drag": true,
  "dragenter": true,
  "dragleave": true,
  "dragover": true,
  "drop": true,
  "dragend": true,
  "keydown": true,
  "keypress": true,
  "keyup": true,
  "load": true,
  "unload": true,
  "abort": true,
  "error": true,
  "resize": true,
  "scroll": true,
  "select": true,
  "change": true,
  "submit": true,
  "reset": true,
  "focus": true,
  "blur": true,

  //touch
  "touchstart": true,
  "touchend": true,
  "touchmove": true,
  "touchenter": true,
  "touchleave": true,
  "touchcancel": true
};

function isObj(thing) {
  return thing && Object.prototype.toString.call(thing) == "[object Object]";
}

function addAttributes(elem, attrs) {
  for(var attr in attrs) {
    if(attr == 'class') {
      var classes = attrs[attr];
      //add class
      if(!(classes instanceof Array)) {
        classes = classes.split(" ");
      }

      for(var i in classes) {
        if(classes[i]) {
          elem.classList.add(classes[i]);
        }
      }
    } else if (attr == 'style') {
      //add styles
      var styles = attrs[attr];
      if(isObj(styles)) {
        for(var s in styles) {
          elem.style[s] = styles[s];
        }
      } else {
        elem.setAttribute("style", styles);
      }
    } else if (handlers[attr] || hic_handlers[attr]) {
      var fn = attrs[attr];
      if(hic_handlers[attr]) {
        hic_handlers[attr](elem, fn);
      } else {
        elem.addEventListener(attr, fn);
      }
    } else {
      elem.setAttribute(attr, attrs[attr]);
    }
  }
}

function toElem(name) {
  var parts = name.match(re_tag);
  if(parts[1][0] == "﷐") {
    parts[1] = parts[1].substring(2);
  }
  var elem = document.createElement(parts[1]);
  if(parts[2]) {
    elem.setAttribute("id", parts[2]);
  }
  if(parts[3]) {
    var classes = parts[3].split(".");
    for(var i in classes) {
      elem.classList.add(classes[i]);
    }
  }
  return elem;
}

function asContent(thing) {
  if(!thing) return;
  if(thing instanceof Element) return thing;
  if(thing instanceof Array) return handleArray(thing);

  return document.createTextNode(thing.toString());
}

function handleFragment(thing) {
  var frag = document.createDocumentFragment();
  for(var i = 0; i < thing.length; i++) {
    var content = asContent(thing[i]);
    if(content) {
      frag.appendChild(content);
    }
  }
  return frag;
}

function handleArray(thing) {
  if(!thing || !thing[0]) return;

  if(thing[0] == "__SEQ__") {
    thing.shift();
    return handleFragment(thing);
  }

  var elem = toElem(thing[0]);
  var mapOrContent = thing[1];
  var start = 2;
  if(isObj(mapOrContent)) {
    addAttributes(elem, mapOrContent);
  } else if(mapOrContent) {
    start = 1;
  }

  for(var i = start; i < thing.length; i++) {
    var content = asContent(thing[i]);
    if(content) {
      elem.appendChild(content);
    }
  }

  return elem;
}


function testMake() {
  var root = ["div"];
  console.time("setup");
  for(var i = 0; i < 1000; i++) {
    root.push(test);
  }
  console.timeEnd("setup");

  console.time("asContent");
  var final = asContent(root);
  console.timeEnd("asContent");
  return root;
}

var hic_handlers = {};
var hic = asContent;

//testMake();
