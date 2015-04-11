(function(window) {

  function now() {
    if(window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
  }

  var events = ["scroll", "click", "contextmenu", "focus", "blur", "input", "keydown"];

  function Renderer() {
    this.content = document.createElement("div");
    this.content.className = "__root";
    this.elementCache = {"__root": this.content};
    this.prevTree = {};
    this.tree = {};
    this.postRenders = [];
    this.lastDiff = {};
    var self = this;
    this.handleEvent = function handleEvent(e) {
      var id = e.currentTarget._id;
      var elem = self.tree[id];
      var handler = elem[e.type];
      if(handler) { handler(e, elem); }
    };
  }

  Renderer.prototype = {
    reset: function() {
      this.prevTree = this.tree;
      this.tree = {};
    },

    domify: function domify() {
      var elements = this.tree;
      var diff = this.lastDiff;
      var elemKeys = Object.keys(diff);
      var elementCache = this.elementCache;
      for(var i = 0, len = elemKeys.length; i < len; i++) {
        var id = elemKeys[i];
        var cur = elements[id];
        var type = diff[id];
        var div;
        if(type === "replaced") {
          var me = elementCache[id];
          me.parentNode.removeChild(me);
          div = document.createElement(cur.t || "div");
          div._id = id;
          elementCache[id] = div;
        } else if(type === "added") {
          div = document.createElement(cur.t || "div");
          div._id = id;
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
        if(cur.c !== div.className) {
          div.className = cur.c || "";
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
        if(type === "added" || type === "replaced") {
          for(var evIx = 0, evLen = events.length; evIx < evLen; evIx++) {
            var event = events[evIx];
            if(cur[event]) { div.addEventListener(event, this.handleEvent); }
          }
          elementCache[cur.parent].appendChild(div);
        }
      }
    },

    diff: function diff() {
      var a = this.prevTree;
      var b = this.tree;
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
        if(curA.t !== curB.t) {
          updated[as[i]] = "replaced";
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
        if(curA.t !== curB.t) {
          updated[bs[i]] = "replaced";
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
      this.lastDiff = updated;
      return updated;
    },

    prepare: function prepare(elem) {
      var tree = this.tree;
      if(!elem.parent) elem.parent = "__root";
      tree[elem.id] = elem;
      if(elem.postRender) {
        this.postRenders.push(elem);
      }
      var children = elem.children;
      if(children) {
        for(var childIx = 0, len = children.length; childIx < len; childIx++) {
          var child = children[childIx];
          if(!child.id) { child.id = elem.id + "__" + childIx; }
          child.parent = elem.id;
          child.ix = childIx;
          this.prepare(child);
        }
      }
      return tree;
    },

    postDomify: function postRender() {
      var postRenders = this.postRenders;
      var diff = this.lastDiff;
      var elementCache = this.elementCache;
      for(var i = 0, len = postRenders.length; i < len; i++) {
        var elem = postRenders[i];
        var id = elem.id;
        if(diff[id] === "updated" || diff[id] === "added") {
          elem.postRender(elementCache[elem.id], elem);
        }
      }
    },

    render: function(elem) {
      var start = now();
      this.reset();
      var post = this.prepare(elem);
      var prepare = now();
      var d = this.diff();
      var diff = now();
      this.domify();
      var domify = now();
      this.postDomify();
      var postDomify = now();
      var time = now() - start;
      if(time > 5) {
        console.log("slow render (> 5ms): ", time, {prepare: prepare - start,
                                                    diff: diff - prepare,
                                                    domify: domify - diff,
                                                    postDomify: postDomify - domify});
      }
    }

  };





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

  window.microReact = {Renderer: Renderer};

})(window);
