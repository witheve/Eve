(function(window) {
  var events = ["scroll", "click", "contextmenu", "focus", "blur", "input", "keydown"];

  var content = document.createElement("div");
  content.className = "__root";
  document.body.appendChild(content);
  var elementCache = {"__root": content};
  function render(elements, diff) {
    var elemKeys = Object.keys(diff);
    for(var i = 0, len = elemKeys.length; i < len; i++) {
      var id = elemKeys[i];
      var cur = elements[id];
      var type = diff[id];
      var div;
      if(type === "added") {
        div = document.createElement(cur.t || "div");
        elementCache[id] = div;
      } else if(type === "updated") {
        div = elementCache[id];
      } else {
        var me = elementCache[id];
        me.parentNode.removeChild(me);
        elementCache[id] = null;
        continue;
      }

      style = div.style;
      if(cur.c !== undefined && cur.c !== div.className) {
        div.className = cur.c;
      }

      div.contentEditable = cur.contentEditable || "inherit";
      if(cur.colspan) {
        div.colSpan = cur.colspan;
      }

      if(cur.left !== undefined) {
        style.position = "absolute";
//         style.transform = "translate(" + cur.left + "px, " + cur.top + "px)";
        style.top = cur.top;
        style.left = cur.left;
        style.height = cur.height;
        style.width = cur.width;
      }

      style.backgroundColor = cur.backgroundColor;
      style.backgroundImage = cur.backgroundImage;
      style.fontSize = cur.fontSize;
      style.color = cur.color;
      if(cur.fontFamily) {
        style.fontFamily = cur.fontFamily;
      }

      if(cur.text !== undefined && cur.text !== div.textContent) {
        div.textContent = cur.text;
      }
      if(type === "added") {
        for(var evIx = 0, evLen = events.length; evIx < evLen; evIx++) {
          var event = events[evIx];
          if(cur[event]) { div.addEventListener(event, cur[event]); }
        }
        elementCache[cur.parent].appendChild(div);
      }
    }
  }

  function diff(a, b) {
    var as = Object.keys(a);
    var bs = Object.keys(b);
    var updated = {};
    for(var i = 0, len = as.length; i < len; i++) {
      var curA = a[as[i]];
      var curB = b[as[i]];
      if(!curB) {
        updated[as[i]] = "removed";
        continue;
      }
      if(curA.top === curB.top
         && curA.left === curB.left
         && curA.width === curB.width
         && curA.height === curB.height
         && curA.c === curB.c
         && curA.text === curB.text) {
        continue;
      }
      updated[as[i]] = "updated";
    }
    for(var i = 0, len = bs.length; i < len; i++) {
      var curA = a[bs[i]];
      var curB = b[bs[i]];
      if(!curA) {
        updated[bs[i]] = "added";
        continue;
      }
      if(curA.top === curB.top
         && curA.left === curB.left
         && curA.width === curB.width
         && curA.height === curB.height
         && curA.c === curB.c
         && curA.text === curB.text) {
        continue;
      }
      updated[bs[i]] = "updated";
    }
    return updated;
  }

  //id
  //type
  //width, height
  //top, left
  //children
  //events

  function prepare(tree, elem) {
    if(typeof elem === "string") return elem;
    if(!elem.parent) elem.parent = "__root";
    tree[elem.id] = elem;
    var children = elem.children;
    if(children) {
      for(var childIx = 0, len = children.length; childIx < len; childIx++) {
        var child = children[childIx];
        if(!child.id) { child.id = elem.id + "__" + childIx; }
        child.parent = elem.id;
        child.ix = childIx;
        prepare(tree, child);
      }
    }
    return elem;
  }


  function test() {
    console.time("build");
    var root = {children: [], id: "testRoot"};
    for(var i = 0; i < 100; i++) {
      var me = {id: "blah" + i};
      var children = [];
      for(var x = 0; x < 100; x++) {
        children[x] = {text: "foo" + x};
      }
      me.children = children;
      root.children[i] = me;
    }
    console.log(root);
    var tree = {};
    prepare(tree, root);
    console.timeEnd("build");
    console.time("diff scratch");
    var d = diff({}, tree);
    console.timeEnd("diff scratch");
    console.time("draw scratch");
    render(tree, d);
    console.timeEnd("draw scratch");
    console.time("diff equal");
    var d2 = diff(tree, tree);
    console.timeEnd("diff equal");
    console.time("draw equal");
    render(tree, d2);
    console.timeEnd("draw equal");
    return [d,d2];
  }

  window.microReact = {prepare: prepare, diff: diff, render: render};

})(window);
