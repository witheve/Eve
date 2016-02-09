declare var Velocity;

export interface Handler<T extends Event> {
  (evt:T, elem:Element): void
}
export interface RenderHandler {
  (node:HTMLElement, elem:Element): void
}

export interface Element {
  t?:string
  c?:string
  id?:string
  parent?:string
  children?:Element[]
  ix?:number
  key?:string
  dirty?:boolean
  semantic?:string
  tween?: any
  enter?: any
  leave?: any
  debug?:any

  // Content
  contentEditable?:boolean
  checked?:boolean
  draggable?:boolean
  href?:string
  src?:string
  download?:string
  placeholder?:string
  selected?:boolean
  tabindex?:number
  text?:string
  strictText?: boolean
  type?:string
  value?:string
  dangerouslySetInnerHTML?:string

  style?: string,

  // Styles (Structure)
  flex?:number|string
  left?:number|string
  top?:number|string
  width?:number|string
  height?:number|string
  textAlign?:string
  transform?:string
  verticalAlign?:string
  zIndex?:number

  // Styles (Aesthetic)
  backgroundColor?:string
  backgroundImage?:string
  border?:string
  borderColor?:string
  borderWidth?:number|string
  borderRadius?:number|string
  color?:string
  colspan?:number
  fontFamily?:string
  fontSize?:string
  opacity?:number

  // Svg
  svg?:boolean
  x?:number|string
  y?:number|string
  dx?:number|string
  dy?:number|string
  cx?:number|string
  cy?:number|string
  r?:number|string
  d?:number|string
  fill?:string
  stroke?:string
  strokeWidth?:string
  startOffset?:number|string
  textAnchor?:string
  viewBox?:string
  xlinkhref?:string

  // Events
  dblclick?:Handler<MouseEvent>
  click?:Handler<MouseEvent>
  contextmenu?:Handler<MouseEvent>
  mousedown?:Handler<MouseEvent>
  mousemove?:Handler<MouseEvent>
  mouseup?:Handler<MouseEvent>
  mouseover?:Handler<MouseEvent>
  mouseout?:Handler<MouseEvent>
  mouseleave?:Handler<MouseEvent>
  mousewheel?:Handler<MouseEvent>
  dragover?:Handler<MouseEvent>
  dragstart?:Handler<MouseEvent>
  dragend?:Handler<MouseEvent>
  drag?:Handler<MouseEvent>
  drop?:Handler<MouseEvent>
  scroll?:Handler<MouseEvent>
  focus?:Handler<FocusEvent>
  blur?:Handler<FocusEvent>
  input?:Handler<Event>
  change?:Handler<Event>
  keyup?:Handler<KeyboardEvent>
  keydown?:Handler<KeyboardEvent>

  postRender?:RenderHandler

  [attr:string]: any
}

function now() {
  if(window.performance) {
    return window.performance.now();
  }
  return (new Date()).getTime();
}

function shallowEquals(a, b) {
  if(a === b) return true;
  if(!a || !b) return false;
  for(var k in a) {
    if(a[k] !== b[k]) return false;
  }
  for(var k in b) {
    if(b[k] !== a[k]) return false;
  }
  return true;
}

function postAnimationRemove(elements) {
  for(let elem of elements) {
    if(elem.parentNode) elem.parentNode.removeChild(elem);
  }
}

export class Renderer {
  // @TODO: A more performant implementation would have a way of rendering subtrees and just have a lambda Renderer to compile into
  static _compileRenderer:{[id:string]: Renderer} = {};
  static compile(elem:Element) {
    if(!elem.id) throw new Error("Cannot compile element with id " + elem.id);
    let renderer = Renderer._compileRenderer[elem.id];
    if(!renderer) renderer = Renderer._compileRenderer[elem.id] = new Renderer();
    renderer.render([elem]);
    return renderer.elementCache[elem.id];
  }
  
  content: HTMLElement;
  elementCache: {[id:string]: HTMLElement};
  prevTree:{[id:string]: Element};
  tree:{[id:string]: Element};
  postRenders: Element[];
  lastDiff: {adds: string[], updates: {}};
  queued: boolean;
  handleEvent: (any);
  constructor() {
    this.content = document.createElement("div");
    this.content.className = "__root";
    this.elementCache = { "__root": this.content };
    this.prevTree = {};
    this.tree = {};
    this.postRenders = [];
    this.lastDiff = {adds: [], updates: {}};
    var self = this;
    this.handleEvent = function handleEvent(e: Event) {
      var id = (e.currentTarget || e.target)["_id"];
      var elem = self.tree[id];
      if (!elem) return;
      var handler = elem[e.type];
      if (handler) { handler(e, elem); }
    };
  }
  reset() {
    this.prevTree = this.tree;
    this.tree = {};
    this.postRenders = [];
  }

  domify() {
    var fakePrev:Element = {}; //create an empty object once instead of every instance of the loop
    var elements = this.tree;
    var prevElements = this.prevTree;
    var diff = this.lastDiff;
    var adds = diff.adds;
    var updates = diff.updates;
    var elemKeys = Object.keys(updates);
    var elementCache = this.elementCache;
    var tempTween:any = {};

    //Create all the new elements to ensure that they're there when they need to be
    //parented
    for(var i = 0, len = adds.length; i < len; i++) {
      var id = adds[i];
      var cur = elements[id];
      var div: any;
      if (cur.svg) {
        div = document.createElementNS("http://www.w3.org/2000/svg", cur.t || "rect");
      } else {
        div = document.createElement(cur.t || "div");
      }
      div._id = id;
      elementCache[id] = div;
      if(cur.enter) {
        if(cur.enter.delay) {
          cur.enter.display = "auto";
          div.style.display = "none";
        }

        Velocity(div, cur.enter, cur.enter);

      }
    }

    for(var i = 0, len = elemKeys.length; i < len; i++) {
      var id = elemKeys[i];
      var cur = elements[id];
      var prev = prevElements[id] || fakePrev;
      var type = updates[id];
      var div;
      if(type === "replaced") {
        var me = elementCache[id];
        if (me.parentNode) me.parentNode.removeChild(me);
        if (cur.svg) {
          div = document.createElementNS("http://www.w3.org/2000/svg", cur.t || "rect");
        } else {
          div = document.createElement(cur.t || "div");
        }
        div._id = id;
        elementCache[id] = div;
      } else if (type === "removed") {
        //NOTE: Batching the removes such that you only remove the parent
        //didn't actually make this faster surprisingly. Given that this
        //strategy is much simpler and there's no noticable perf difference
        //we'll just do the dumb thing and remove all the children one by one.
        var me = elementCache[id]
        if(prev.leave) {
          prev.leave.complete = postAnimationRemove;
          if(prev.leave.absolute) {
            me.style.position = "absolute";
          }
          Velocity(me, prev.leave, prev.leave);
        }
        else if(me.parentNode) me.parentNode.removeChild(me);
        elementCache[id] = null;
        continue;
      } else {
        div = elementCache[id];
      }

      var style = div.style;
      if(cur.c !== prev.c) div.className = cur.c;
      if(cur.draggable !== prev.draggable) div.draggable = cur.draggable === undefined ? null : "true";
      if(cur.contentEditable !== prev.contentEditable) div.contentEditable = cur.contentEditable || "inherit";
      if(cur.colspan !== prev.colspan) div.colSpan = cur.colspan;
      if(cur.placeholder !== prev.placeholder) div.placeholder = cur.placeholder;
      if(cur.selected !== prev.selected) div.selected = cur.selected;
      if(cur.value !== prev.value) div.value = cur.value;
      if(cur.t === "input" && cur.type !== prev.type) div.type = cur.type;
      if(cur.t === "input" && cur.checked !== prev.checked) div.checked = cur.checked;
      if((cur.text !== prev.text || cur.strictText) && div.textContent !== cur.text) div.textContent = cur.text === undefined ? "" : cur.text;
      if(cur.tabindex !== prev.tabindex) div.setAttribute("tabindex", cur.tabindex);
      if(cur.href !== prev.href) div.setAttribute("href", cur.href);
      if(cur.src !== prev.src) div.setAttribute("src", cur.src);
      if(cur.download !== prev.download) div.setAttribute("download", cur.download);

      // animateable properties
      var tween = cur.tween || tempTween;
      if(cur.flex !== prev.flex) {
        if(tween.flex) tempTween.flex = cur.flex;
        else style.flex = cur.flex === undefined ? "" : cur.flex;
      }
      if(cur.left !== prev.left) {
          if(tween.left) tempTween.left = cur.left;
          else style.left = cur.left === undefined ? "" : cur.left;
      }
      if(cur.top !== prev.top) {
        if(tween.top) tempTween.top = cur.top;
        else style.top = cur.top === undefined ? "" : cur.top;
      }
      if(cur.height !== prev.height) {
        if(tween.height) tempTween.height = cur.height;
        else style.height = cur.height === undefined ? "auto" : cur.height;
      }
      if(cur.width !== prev.width) {
        if(tween.width) tempTween.width = cur.width;
        else style.width = cur.width === undefined ? "auto" : cur.width;
      }
      if(cur.zIndex !== prev.zIndex) {
        if(tween.zIndex) tempTween.zIndex = cur.zIndex;
        else style.zIndex = cur.zIndex;
      }
      if(cur.backgroundColor !== prev.backgroundColor) {
        if(tween.backgroundColor) tempTween.backgroundColor = cur.backgroundColor;
        else style.backgroundColor = cur.backgroundColor || "transparent";
      }
      if(cur.borderColor !== prev.borderColor) {
        if(tween.borderColor) tempTween.borderColor = cur.borderColor;
        else style.borderColor = cur.borderColor || "none";
      }
      if(cur.borderWidth !== prev.borderWidth) {
        if(tween.borderWidth) tempTween.borderWidth = cur.borderWidth;
        else style.borderWidth = cur.borderWidth || 0;
      }
      if(cur.borderRadius !== prev.borderRadius) {
        if(tween.borderRadius) tempTween.borderRadius = cur.borderRadius;
        else style.borderRadius = (cur.borderRadius || 0) + "px";
      }
      if(cur.opacity !== prev.opacity) {
        if(tween.opacity) tempTween.opacity = cur.opacity;
        else style.opacity = cur.opacity === undefined ? 1 : cur.opacity;
      }
      if(cur.fontSize !== prev.fontSize) {
        if(tween.fontSize) tempTween.fontSize = cur.fontSize;
        else style.fontSize = cur.fontSize;
      }
      if(cur.color !== prev.color) {
        if(tween.color) tempTween.color = cur.color;
        else style.color = cur.color || "inherit";
      }

      let animKeys = Object.keys(tempTween);
      if(animKeys.length) {
        Velocity(div, tempTween, tween);
        tempTween = {};
      }

      // non-animation style properties
      if(cur.backgroundImage !== prev.backgroundImage) style.backgroundImage = `url('${cur.backgroundImage}')`;
      if(cur.border !== prev.border) style.border = cur.border || "none";
      if(cur.textAlign !== prev.textAlign) {
        style.alignItems = cur.textAlign;
        if(cur.textAlign === "center") {
          style.textAlign = "center";
        } else if(cur.textAlign === "flex-end") {
          style.textAlign = "right";
        } else {
          style.textAlign = "left";
        }
      }
      if(cur.verticalAlign !== prev.verticalAlign) style.justifyContent = cur.verticalAlign;
      if(cur.fontFamily !== prev.fontFamily) style.fontFamily = cur.fontFamily || "inherit";
      if(cur.transform !== prev.transform) style.transform = cur.transform || "none";
      if(cur.style !== prev.style) div.setAttribute("style", cur.style);

      if(cur.dangerouslySetInnerHTML !== prev.dangerouslySetInnerHTML) div.innerHTML = cur.dangerouslySetInnerHTML;

      // debug/programmatic properties
      if(cur.semantic !== prev.semantic) div.setAttribute("data-semantic", cur.semantic);
      if(cur.debug !== prev.debug) div.setAttribute("data-debug", cur.debug);

      // SVG properties
      if(cur.svg) {
        if(cur.fill !== prev.fill) div.setAttributeNS(null, "fill", cur.fill);
        if(cur.stroke !== prev.stroke) div.setAttributeNS(null, "stroke", cur.stroke);
        if(cur.strokeWidth !== prev.strokeWidth) div.setAttributeNS(null, "stroke-width", cur.strokeWidth);
        if(cur.d !== prev.d) div.setAttributeNS(null, "d", cur.d);
        if(cur.c !== prev.c) div.setAttributeNS(null, "class", cur.c);
        if(cur.x !== prev.x)  div.setAttributeNS(null, "x", cur.x);
        if(cur.y !== prev.y) div.setAttributeNS(null, "y", cur.y);
        if(cur.dx !== prev.dx)  div.setAttributeNS(null, "dx", cur.dx);
        if(cur.dy !== prev.dy) div.setAttributeNS(null, "dy", cur.dy);
        if(cur.cx !== prev.cx)  div.setAttributeNS(null, "cx", cur.cx);
        if(cur.cy !== prev.cy) div.setAttributeNS(null, "cy", cur.cy);
        if(cur.r !== prev.r) div.setAttributeNS(null, "r", cur.r);
        if(cur.height !== prev.height) div.setAttributeNS(null, "height", cur.height);
        if(cur.width !== prev.width)  div.setAttributeNS(null, "width", cur.width);
        if(cur.xlinkhref !== prev.xlinkhref)  div.setAttributeNS('http://www.w3.org/1999/xlink', "href", cur.xlinkhref);
        if(cur.startOffset !== prev.startOffset) div.setAttributeNS(null, "startOffset", cur.startOffset);
        if(cur.id !== prev.id) div.setAttributeNS(null, "id", cur.id);
        if(cur.viewBox !== prev.viewBox) div.setAttributeNS(null, "viewBox", cur.viewBox);
        if(cur.transform !== prev.transform) div.setAttributeNS(null, "transform", cur.transform);
        if(cur.draggable !== prev.draggable) div.setAttributeNS(null, "draggable", cur.draggable);
        if(cur.textAnchor !== prev.textAnchor) div.setAttributeNS(null, "text-anchor", cur.textAnchor);
      }

      //events
      if(cur.dblclick !== prev.dblclick) div.ondblclick = cur.dblclick !== undefined ? this.handleEvent : undefined;
      if(cur.click !== prev.click) div.onclick = cur.click !== undefined ? this.handleEvent : undefined;
      if(cur.contextmenu !== prev.contextmenu) div.oncontextmenu = cur.contextmenu !== undefined ? this.handleEvent : undefined;
      if(cur.mousedown !== prev.mousedown) div.onmousedown = cur.mousedown !== undefined ? this.handleEvent : undefined;
      if(cur.mousemove !== prev.mousemove) div.onmousemove = cur.mousemove !== undefined ? this.handleEvent : undefined;
      if(cur.mouseup !== prev.mouseup) div.onmouseup = cur.mouseup !== undefined ? this.handleEvent : undefined;
      if(cur.mouseover !== prev.mouseover) div.onmouseover = cur.mouseover !== undefined ? this.handleEvent : undefined;
      if(cur.mouseout !== prev.mouseout) div.onmouseout = cur.mouseout !== undefined ? this.handleEvent : undefined;
      if(cur.mouseleave !== prev.mouseleave) div.onmouseleave = cur.mouseleave !== undefined ? this.handleEvent : undefined;
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
      if(cur.change !== prev.change) div.onchange = cur.change !== undefined ? this.handleEvent : undefined;
      if(cur.keyup !== prev.keyup) div.onkeyup = cur.keyup !== undefined ? this.handleEvent : undefined;
      if(cur.keydown !== prev.keydown) div.onkeydown = cur.keydown !== undefined ? this.handleEvent : undefined;

      if(type === "added" || type === "replaced" || type === "moved") {
        var parentEl = elementCache[cur.parent];
        if(parentEl) {
          if(cur.ix >= parentEl.children.length) {
            parentEl.appendChild(div);
          } else {
            parentEl.insertBefore(div, parentEl.children[cur.ix]);
          }
        }
      }
    }
  }

  diff() {
    var a = this.prevTree;
    var b = this.tree;
    var as = Object.keys(a);
    var bs = Object.keys(b);
    var updated = {};
    var adds = [];
    for(var i = 0, len = as.length; i < len; i++) {
      var id = as[i];
      var curA = a[id];
      var curB = b[id];
      if(curB === undefined) {
        updated[id] = "removed";
        continue;
      }
      if(curA.t !== curB.t) {
        updated[id] = "replaced";
        continue;
      }
      if(curA.ix !== curB.ix || curA.parent !== curB.parent) {
        updated[id] = "moved";
        continue;
      }

      if(!curB.dirty
          && curA.c === curB.c
          && curA.key === curB.key
          && curA.dangerouslySetInnerHTML === curB.dangerouslySetInnerHTML
          && curA.tabindex === curB.tabindex
          && curA.href === curB.href
          && curA.src === curB.src
          && curA.download === curB.download
          && curA.placeholder === curB.placeholder
          && curA.selected === curB.selected
          && curA.draggable === curB.draggable
          && curA.contentEditable === curB.contentEditable
          && curA.value === curB.value
          && curA.type === curB.type
          && curA.checked === curB.checked
          && curA.text === curB.text
          && curA.top === curB.top
          && curA.flex === curB.flex
          && curA.left === curB.left
          && curA.width === curB.width
          && curA.height === curB.height
          && curA.zIndex === curB.zIndex
          && curA.backgroundColor === curB.backgroundColor
          && curA.backgroundImage === curB.backgroundImage
          && curA.color === curB.color
          && curA.colspan === curB.colspan
          && curA.border === curB.border
          && curA.borderColor === curB.borderColor
          && curA.borderWidth === curB.borderWidth
          && curA.borderRadius === curB.borderRadius
          && curA.opacity === curB.opacity
          && curA.fontFamily === curB.fontFamily
          && curA.fontSize === curB.fontSize
          && curA.textAlign === curB.textAlign
          && curA.transform === curB.transform
          && curA.verticalAlign === curB.verticalAlign
          && curA.semantic === curB.semantic
          && curA.debug === curB.debug
          && curA.style === curB.style
          && (curB.svg === undefined || (
              curA.x === curB.x
              && curA.y === curB.y
              && curA.dx === curB.dx
              && curA.dy === curB.dy
              && curA.cx === curB.cx
              && curA.cy === curB.cy
              && curA.r === curB.r
              && curA.d === curB.d
              && curA.fill === curB.fill
              && curA.stroke === curB.stroke
              && curA.strokeWidth === curB.strokeWidth
              && curA.startOffset === curB.startOffset
              && curA.textAnchor === curB.textAnchor
              && curA.viewBox === curB.viewBox
              && curA.xlinkhref === curB.xlinkhref))
              ) {
        continue;
      }
      updated[id] = "updated";
    }
    for(var i = 0, len = bs.length; i < len; i++) {
      var id = bs[i];
      var curA = a[id];
      if(curA === undefined) {
        adds.push(id);
        updated[id] = "added";
        continue;
      }
    }
    this.lastDiff = {adds: adds, updates: updated};
    return this.lastDiff;
  }

  prepare(root:Element) {
    var elemLen = 1;
    var tree = this.tree;
    var elements = [root];
    var elem:Element;
    for(var elemIx = 0; elemIx < elemLen; elemIx++) {
      elem = elements[elemIx];
      if(elem.parent === undefined) elem.parent = "__root";
      if(elem.id === undefined) elem.id = "__root__" + elemIx;
      tree[elem.id] = elem;
      if(elem.postRender !== undefined) {
        this.postRenders.push(elem);
      }
      var children = elem.children;
      if(children !== undefined) {
        for(var childIx = 0, len = children.length; childIx < len; childIx++) {
          var child = children[childIx];
          if(child === undefined) continue;
          if(child.id === undefined) { child.id = elem.id + "__" + childIx; }
          if(child.ix === undefined) { child.ix = childIx; }
          if(child.parent === undefined) { child.parent = elem.id; }
          elements.push(child);
          elemLen++;
        }
      }
    }
    return tree;
  }

  postDomify() {
    var postRenders = this.postRenders;
    var diff = this.lastDiff.updates;
    var elementCache = this.elementCache;
    for(var i = 0, len = postRenders.length; i < len; i++) {
      var elem = postRenders[i];
      var id = elem.id;
      if(diff[id] === "updated" || diff[id] === "added" || diff[id] === "replaced" || elem.dirty || diff[id] === "moved") {
        elem.postRender(elementCache[elem.id], elem);
      }
    }
  }

  render(elems:Element[]) {
      this.reset();
    // We sort elements by depth to allow them to be self referential.
    elems.sort((a, b) => (a.parent ? a.parent.split("__").length : 0) - (b.parent ? b.parent.split("__").length : 0));
    let start = now();
    for(let elem of elems) {
      let post = this.prepare(elem);

    }
    let prepare = now();
    let d = this.diff();
    let diff = now();
    this.domify();
    let domify = now();
    this.postDomify();
    let postDomify = now();
    let time = now() - start;
    if(time > 5) {
      console.log("slow render (> 5ms): ", time, {
        prepare: prepare - start,
        diff: diff - prepare,
        domify: domify - diff,
        postDomify: postDomify - domify
      });
    }
  }
}
