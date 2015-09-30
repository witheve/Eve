(function(window) {

  var normalLog =  window.console.log;
  function sendingLog() {
    var log = [];
    for(var arg of arguments) {
      log.push(safeStringify(arg));
    }
    ipc.sendToHost("jsLog", {args: {}, log});
    normalLog.apply(window.console, arguments);
  }
  window.console.log = sendingLog;

  var ipc = require("ipc");

  function toArray(arrayLike) {
    var final = [];
    for(var i = 0, len = arrayLike.length; i < len; i++) {
      final.push(arrayLike.item(i));
    }
    return final;
  }

  ipc.on("injectCSS", function(args) {
    var nodeName = args.name.replace(/\./, "-");
    var code = args.code;
    var styleElem = document.createElement("style");
    styleElem.type = "text/css"
    styleElem.id = nodeName;
    styleElem.innerHTML = code;
    var prev = document.getElementById(nodeName);
    if(prev) {
      prev.parentNode.removeChild(prev);
    } else {
      var link = toArray(document.head.querySelectorAll("link")).filter(function(cur) {
        return cur.href.indexOf(args.name) > -1;
      });
      if(link[0]) {
        link[0].parentNode.removeChild(link[0]);
      }
    }
    document.head.appendChild(styleElem);
  });



  ipc.on("evalJS", function(args) {
      try {
          var res = eval.call(window, args.code);
          ipc.sendToHost("jsResult", {args, result: safeStringify(res)});
      } catch (e) {
          var error;
          if(e.stack) {
            error = e.stack;
          } else {
            error = e.toString();
          }
          ipc.sendToHost("jsError", {args, error});
      }
  });

  function replacer(key, value) {
    if(window.jQuery && value instanceof jQuery) {
      return "[jQuery $(" + value.selector + ")]";
    }
    if(value instanceof Element) {
      return "[Element " + value.tagName.toLowerCase() + (value.id != "" ? "#" : "") + value.id + "]";
    }
    if(value instanceof Array) {
      return value;
    }
    if(typeof(value) == "object") {
      if(cache.indexOf(value) > -1) {
        return "circular";
      }
      cache.push(value);
      return value;
    }
    if(typeof value == "function") {
      return "[function]";
    }
    return value;
  }

  function safeStringify(res) {
    cache = [];
    return JSON.stringify(res, replacer);
  }

})(window);

