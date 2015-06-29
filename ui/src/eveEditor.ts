/// <reference path="microReact.ts" />
/// <reference path="uiEditorRenderer.ts" />
/// <reference path="uiEditor.ts" />
/// <reference path="query-editor.ts" />
/// <reference path="tableEditor.ts" />
/// <reference path="itemList.ts" />
module eveEditor {
  declare var uuid;
  declare var api;
  declare var DEBUG;
  var ixer = api.ixer;
  var code = api.code;
  var KEYS = api.KEYS;
  var localState = api.localState;
  
  //---------------------------------------------------------
  // Renderer
  //---------------------------------------------------------
  
  export var renderer = new microReact.Renderer();
  document.body.appendChild(renderer.content);
  renderer.queued = false;
  export function render() {
   if(renderer.queued === false) {
      renderer.queued = true;
      requestAnimationFrame(function() {
        renderer.queued = false;
        renderer.render(root());
        uiEditorRenderer.render();
      });
    }
  }
  
  window.addEventListener("resize", render);
  document.body.addEventListener("drop", api.preventDefault);
  
  //---------------------------------------------------------
  // Local state
  //---------------------------------------------------------
  
  export var eventStack = {root: true, children: [], localState: api.clone(localState), parent: null, diffs: null};

  function scaryUndoEvent(): any[] {
    if(!eventStack.parent || !eventStack.diffs) return [];

    var old = eventStack;
    eventStack = old.parent;
    localState = api.clone(eventStack.localState);
    api.localState = localState;
    return api.reverseDiff(old.diffs);
  }

  function scaryRedoEvent(): any[] {
    if(!eventStack.children.length) return [];

    eventStack = eventStack.children[eventStack.children.length - 1];
    localState = api.clone(eventStack.localState);
    return eventStack.diffs;
  }
  
  //---------------------------------------------------------
  // dispatch
  //---------------------------------------------------------
  
  export function dispatch(event: string, info: any) {
   var storeEvent = true;
    var sendToServer = true;
    var txId = ++localState.txId;

    var diffs = [];
    switch(event) {
      case "addTable":
        var id = uuid();
        var fieldId = uuid();
        diffs.push(["editor item", "inserted", [id, "table"]],
                   ["view", "inserted", [id, "table"]],
                   ["field", "inserted", [id, fieldId, "output"]],
                   ["display order", "inserted", [fieldId, 0]],
                   ["display name", "inserted", [id, "Untitled Table"]],
                   ["display name", "inserted", [fieldId, "A"]]);
        localState.activeItem = id;
        localState.adderRows = [[], []];
        break;
      case "addQuery":
        var id = uuid();
        diffs.push(["editor item", "inserted", [id, "query"]],
                   ["display name", "inserted", [id, "Untitled Query"]]);
        localState.activeItem = id;
        break;
      case "addUi":
        var id = uuid();
        var layerId = uuid();
        diffs.push(["editor item", "inserted", [id, "ui"]],
                   ["display name", "inserted", [id, "Untitled Page"]],
                   ["uiComponentLayer", "inserted", [txId, layerId, id, 0, false, false, id]],
                   ["display name", "inserted", [layerId, "Page"]]);
        localState.activeItem = id;
        localState.uiActiveLayer = layerId;
        localState.openLayers[layerId] = true;
        break;
      case "rename":
        var id = info.id;
        sendToServer = !!info.sendToServer;
        if(info.value === undefined || info.value === info.initial[1]) { return; }
        diffs.push(["display name", "inserted", [id, info.value]],
                   ["display name", "removed", info.initial])
        break;
      case "undo":
        storeEvent = false;
        diffs = scaryUndoEvent();
        break;
      case "redo":
        storeEvent = false;
        diffs = scaryRedoEvent();
        break;
      default:
        console.error("Unhandled dispatch:", event, info);
        break;
    }
   executeDispatch(diffs, storeEvent, sendToServer); 
  }
	
	export function executeDispatch(diffs, storeEvent, sendToServer) {
    if(diffs && diffs.length) {
      if(storeEvent) {
        var eventItem = {event: event, diffs: diffs, children: [], parent: eventStack, localState: api.clone(localState), root: false};
        eventStack.children.push(eventItem);
        eventStack = eventItem;
      }

      ixer.handleDiffs(diffs);
      if(sendToServer) {
        if(DEBUG.DELAY) {
          setTimeout(function() {
            client.sendToServer(diffs, false);
          }, DEBUG.DELAY);
        } else {
          client.sendToServer(diffs, false);
        }
      }

    } else {
      //       console.warn("No diffs to index, skipping.");
    }
    
    //@TODO: since we don't have a way to determine if localState has changed, we have
    //to render anytime dispatch is called
    render();
  }
  
  //---------------------------------------------------------
  // Root
  //---------------------------------------------------------
  
  function root() {
    var itemId = code.activeItemId();
    var type = ixer.index("editor item to type")[itemId];

    var workspace;
    if(type === "query") {
      workspace = queryEditor.queryWorkspace(itemId);
    } else if(type === "ui") {
      workspace = uiEditor.uiWorkspace(itemId);
    } else if(type === "table") {
      workspace = tableEditor.tableWorkspace(itemId);
    }
    var arrowDir = localState.showMenu ? "left" : "right";
    return {id: "root", c: "root", children: [
      itemList.editorItemList(itemId),
      {c: "items-toggle ion-ios-arrow-" + arrowDir, click: itemList.toggleMenu},
      workspace,
    ]};
  }
  
  export function genericWorkspace(klass, itemId, content) {
    var title = tableEditor.input(code.name(itemId), itemId, tableEditor.rename, tableEditor.rename);
    title.c += " title";
    return {id: "workspace",
            c: "workspace-container " + klass,
            children: [
              title,
              {c: "content", children: [content]}
            ]};
  }
  
  //---------------------------------------------------------
  // Global key handling
  //---------------------------------------------------------

  document.addEventListener("keydown", function(e) {
    //Don't capture keys if they are
    var target: any = e.target;
    if(e.defaultPrevented
       || target.nodeName === "INPUT"
       || target.getAttribute("contentEditable")) {
      return;
    }

    //undo + redo
    if((e.metaKey || e.ctrlKey) && e.shiftKey && e.keyCode === KEYS.Z) {
      dispatch("redo", null);
    } else if((e.metaKey || e.ctrlKey) && e.keyCode === KEYS.Z) {
      dispatch("undo", null);
    }

  });

  //---------------------------------------------------------
  // Go
  //---------------------------------------------------------
  //render();
  window["dispatcher"] = eveEditor;
}