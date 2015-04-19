(function(window) {

  function now() {
    if(window.performance) {
      return window.performance.now();
    }
    return (new Date()).getTime();
  }


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
      if(!elem) return;
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
      var fakePrev = {}; //create an empty object once instead of every instance of the loop
      var elements = this.tree;
      var prevElements = this.prevTree;
      var diff = this.lastDiff;
      var elemKeys = Object.keys(diff);
      var elementCache = this.elementCache;
      for(var i = 0, len = elemKeys.length; i < len; i++) {
        var id = elemKeys[i];
        var cur = elements[id];
        var prev = prevElements[id] || fakePrev;
        var type = diff[id];
        var div;
        if(type === "replaced") {
          var me = elementCache[id];
          if(me.parentNode) me.parentNode.removeChild(me);
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
          //NOTE: Batching the removes such that you only remove the parent
          //didn't actually make this faster surprisingly. Given that this
          //strategy is much simpler and there's no noticable perf difference
          //we'll just do the dumb thing and remove all the children one by one.
          var me = elementCache[id]
          if(me.parentNode) me.parentNode.removeChild(me);
          elementCache[id] = null;
          continue;
        }

        style = div.style;

        if(cur.c !== prev.c) div.className = cur.c;
        if(cur.draggable !== prev.draggable) div.draggable = cur.draggable;
        if(cur.contentEditable !== prev.contentEditable) div.contentEditable = cur.contentEditable || "inherit";
        if(cur.colspan !== prev.colspan) div.colSpan = cur.colspan;

        if(cur.left !== prev.left)  style.left = cur.left;
        if(cur.top !== prev.top) style.top = cur.top;
        if(cur.height !== prev.height) style.height = cur.height;
        if(cur.width !== prev.width)  style.width = cur.width;
        if(cur.zIndex !== prev.zIndex) style.zIndex = cur.zIndex;

        if(cur.backgroundColor !== prev.backgroundColor) style.backgroundColor = cur.backgroundColor;
        if(cur.backgroundImage !== prev.backgroundImage) {
          style.backgroundImage = "url('" + cur.backgroundImage + "')";
        }
        if(cur.border !== prev.border) style.border = cur.border;
        if(cur.borderRadius !== prev.borderRadius) style.borderRadius = cur.borderRadius;
        if(cur.fontSize !== prev.fontSize) style.fontSize = cur.fontSize;
        if(cur.textAlign !== prev.textAlign) style.justifyContent = cur.textAlign;
        if(cur.verticalAlign !== prev.verticalAlign) style.alignItems = cur.verticalAlign;
        if(cur.color !== prev.color) style.color = cur.color;
        if(cur.fontFamily !== prev.fontFamily) style.fontFamily = cur.fontFamily;
        if(cur.value !== prev.value) div.value = cur.value;
        if(cur.t === "input" && cur.type !== prev.type) div.type = cur.type;
        if(cur.text !== prev.text) div.textContent = cur.text;

        //events
        if(cur.click !== prev.click) div.onclick = cur.click !== undefined ? this.handleEvent : undefined;
        if(cur.contextmenu !== prev.contextmenu) div.oncontextmenu = cur.contextmenu !== undefined ? this.handleEvent : undefined;
        if(cur.mousedown !== prev.mousedown) div.onmousedown = cur.mousedown !== undefined ? this.handleEvent : undefined;
        if(cur.mousewheel !== prev.mousewheel) div.onmouseheel = cur.mousewheel !== undefined ? this.handleEvent : undefined;
        if(cur.dragover !== prev.dragover) div.ondragover = cur.dragover !== undefined ? this.handleEvent : undefined;
        if(cur.dragstart !== prev.dragstart) div.ondragstart = cur.dragstart !== undefined ? this.handleEvent : undefined;
        if(cur.dragend !== prev.dragend) div.ondragend = cur.dragend !== undefined ? this.handleEvent : undefined;
        if(cur.drag !== prev.drag) div.ondrag = cur.drag !== undefined ? this.handleEvent : undefined;
        if(cur.drop !== prev.drop) div.ondrop = cur.drop !== undefined ? this.handleEvent : undefined;
        if(cur.scroll !== prev.scroll) div.onscroll = cur.scroll !== undefined ? this.handleEvent : undefined;
        if(cur.focus !== prev.focus) div.onfocus = cur.focus !== undefined ? this.handleEvent : undefined;
        if(cur.blur !== prev.blur) div.onblur = cur.blur !== undefined ? this.handleEvent : undefined;
        if(cur.input !== prev.input) div.oninput = cur.input !== undefined ? this.handleEvent : undefined;
        if(cur.keydown !== prev.keydown) div.onkeydown = cur.keydown !== undefined ? this.handleEvent : undefined;

        if(type === "added" || type === "replaced") {
          //TODO: we aren't inserting in order.
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
        if(curB === undefined) {
          updated[as[i]] = "removed";
          continue;
        }
        if(curA.t !== curB.t) {
          updated[as[i]] = "replaced";
          continue;
        }
        if(curA.c === curB.c
           && curA.value === curB.value
           && curA.text === curB.text
           && curA.top === curB.top
           && curA.left === curB.left
           && curA.width === curB.width
           && curA.height === curB.height
           && curA.zIndex === curB.zIndex
           && curA.backgroundColor === curB.backgroundColor
           && curA.backgroundImage === curB.backgroundImage
           && curA.color === curB.color
           && curA.border === curB.border
           && curA.borderRadius === curB.borderRadius
           && curA.fontFamily === curB.fontFamily
           && curA.fontSize === curB.fontSize
           && curA.textAlign === curB.textAlign
           && curA.verticalAlign === curB.verticalAlign) {
          continue;
        }
        updated[as[i]] = "updated";
      }
      for(var i = 0, len = bs.length; i < len; i++) {
        var curA = a[bs[i]];
        var curB = b[bs[i]];
        if(curA === undefined) {
          updated[bs[i]] = "added";
          continue;
        }
        if(curA.t !== curB.t) {
          updated[bs[i]] = "replaced";
          continue;
        }
        if(curA.c === curB.c
           && curA.value === curB.value
           && curA.text === curB.text
           && curA.top === curB.top
           && curA.left === curB.left
           && curA.width === curB.width
           && curA.height === curB.height
           && curA.zIndex === curB.zIndex
           && curA.backgroundColor === curB.backgroundColor
           && curA.backgroundImage === curB.backgroundImage
           && curA.color === curB.color
           && curA.border === curB.border
           && curA.borderRadius === curB.borderRadius
           && curA.fontFamily === curB.fontFamily
           && curA.fontSize === curB.fontSize
           && curA.textAlign === curB.textAlign
           && curA.verticalAlign === curB.verticalAlign) {
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
          if(child === undefined) continue;
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
