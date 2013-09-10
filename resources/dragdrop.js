(function(b,c){var $=b.jQuery||b.Cowboy||(b.Cowboy={}),a;$.throttle=a=function(e,f,j,i){var h,d=0;if(typeof f!=="boolean"){i=j;j=f;f=c}function g(){var o=this,m=+new Date()-d,n=arguments;function l(){d=+new Date();j.apply(o,n)}function k(){h=c}if(i&&!h){l()}h&&clearTimeout(h);if(i===c&&m>e){l()}else{if(f!==true){h=setTimeout(i?k:l,i===c?e-m:e)}}}if($.guid){g.guid=j.guid=j.guid||$.guid++}return g};$.debounce=function(d,e,f){return f===c?a(d,e,false):a(d,f,e!==false)}})(this);

function initSortable(window) {
  var dragging, placeholders = [];
  var dom = aurora.util.dom;
  var placeholder = dom.make('<span class="sortable-placeholder">')[0];
  var sortable = function(me, options) {
    var index, items = dom.children(me);

    if (options.connectWith) {
      var is = dom.$$(options.connectWith);
      for(var i in is) {
        is[i].sortConnect = options.connectWith;
      }
    }

    function dragStart(e) {
      var dt = e.dataTransfer;
      dt.effectAllowed = 'move';
      dt.setData('Text', 'dummy');
      dragging = e.target;
      dom.add_class(me, "dragging");
      //placeholder = dom.make(dragging.outerHTML)[0];
      dom.css(placeholder, {"height": dragging.offsetHeight + "px",
                            "width": dragging.offsetWidth + "px"});
      index = dom.index(e.target);
      dom.add_class(dragging, "sortable-dragging");
      //dom.css(dragging, {opacity: 0});
    }

    function dragEnd(e) {
      if (!dragging) {
        return;
      }
      dom.remove_class(me, "dragging");
      dom.remove_class(dragging, "sortable-dragging");
      dom.css(dragging, {"display":"",
                         "opacity": ""})
      if(dom.parent(dragging) != dom.parent(placeholder)) {
        //we've moved to a new sortable
        dom.after(placeholder, dragging);
        dom.remove(placeholder);
        dom.trigger(dom.parent(dragging), "moved", dragging);
        dragging = null;
        return;
      }
      dom.after(placeholder, dragging);
      dom.remove(placeholder);
      if (index != dom.index(dragging)) {
        dom.trigger(dom.parent(dragging), "sortupdate", dom.children(dom.parent(dragging)));
      }
      dragging = null;
    }

    function dragOver(e) {
      if(!dragging) {
        return false;
      }
      dom.css(dragging, {"display": "none"});
      var index = dom.index(this);

      if(e.target === me && dom.parent(placeholder) != me) {
        dom.append(me, placeholder);
        return false;
      }

      if (dom.parent(dragging) != dom.parent(e.target) && dom.parent(dragging).sortConnect !== dom.parent(e.target).sortConnect) {
        return true;
      }
      if (e.type == 'drop') {
        e.stopPropagation();
        dom.trigger(dragging, "dragend");
        return false;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dom.parent(e.target) == me) {
        if(dom.index(placeholder) == index || e.target == placeholder) {
          //
        } else if(dom.index(placeholder) < index) {
          dom.after(e.target, placeholder);
        } else {
          dom.before(e.target, placeholder);
        }
      } else if (e.target != placeholder && dom.parent(e.target) != me) {
        dom.append(this, placeholder);
      }
      return false;
    }

    for(var i = 0; i < items.length; i++) {
      dom.on(items[i], "dragstart", dragStart);
      dom.on(items[i], "dragover", Cowboy.throttle(20, dragOver));
      dom.on(items[i], "drop", dragOver);
      dom.on(items[i], "dragenter", dragOver);
      dom.on(items[i], "dragend", dragEnd);
    }

    dom.on(me, "dragover", dragOver);
    dom.on(me, "drop", dragOver);
    dom.on(me, "dragenter", dragOver);

    return me;

  };

  window.sortable = sortable;
};
initSortable(window);
