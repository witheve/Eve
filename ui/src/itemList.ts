/// <reference path="eveEditor.ts" />

module itemList {
	declare var uuid;
  declare var api;
  declare var DEBUG;
  var ixer = api.ixer;
  var code = api.code;
  var localState = api.localState;

  function dispatch(event: string, info: any, rentrant?: boolean) {
    var storeEvent = true;
    var sendToServer = true;
    var txId = ++localState.txId;
    var redispatched = false;
    var diffs = [];
    switch(event) {
      case "toggleHidden":
  	    localState.showHidden = !localState.showHidden;
        break;
      case "toggleMenu":
        localState.showMenu = !localState.showMenu;
        break;
      case "closeAndSelectItem":
        localState.showMenu = false;
        dispatch("selectItem", info, true);
        break;
      case "removeItem":
        diffs = api.toDiffs(api.remove("editor item",{"item":info}));
        break;
      default:
        redispatched = true;
        eveEditor.dispatch(event, info);
        break;
    }
    if(!redispatched && !rentrant) {
      eveEditor.executeDispatch(diffs, storeEvent, sendToServer);
    }
  }

 	export function editorItemList(itemId) {
    var views = ixer.facts("editor item");
    // @TODO: filter me based on tags local and compiler.
    var items = ixer.facts("editor item").map(function(cur) {
      var id = cur[0];
      if(!localState.showHidden && code.hasTag(id, "hidden")) {
        return;
      }
      var type = cur[1];
      var klass = "editor-item " + type;
      var icon = "ion-grid";
      if(type === "query") {
        icon = "ion-cube";
      } else if(type === "ui") {
        icon = "ion-image";
      }
      if(itemId === id) {
        klass += " selected";
      }

      var dragId = id;
      var draggable = true;
      if(type === "query") {
        dragId = ixer.index("query to export")[id];
        if(!dragId) {
          draggable = false;
        }
      }

      var name = code.name(id) || "";
      return {c: klass, name: name, click: selectEditorItem, dblclick: closeSelectEditorItem, dragData: {value: dragId, type: "view"}, itemId: id, draggable: draggable, dragstart: dragItem, children: [
        {c: "icon " + icon},
        {text: name},
        {c: "add-layer", text: "X", click: removeItem, id: id},
      ]};
    })
    items.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    var width = 0;
    if(localState.showMenu) {
      width = 200;
    }
    return {c: "editor-item-list", width:width, children: [
      {c: "adder", children: [
        {c: "button table", click: addItem, event: "addTable", children: [
          {c: "ion-grid"},
          {c: "ion-plus"},
        ]},
        {c: "button query", click: addItem, event: "addQuery", children: [
          {c: "ion-cube"},
          {c: "ion-plus"},
        ]},
        {c: "button ui", click: addItem, event: "addUi", children: [
          {c: "ion-image"},
          {c: "ion-plus"},
        ]},
      ]},
      {c: "items", children: items},
      {c: "show-hidden", click: toggleHiddenEditorItems, children: [
        {text: "show hidden"}
      ]}
    ]};
  }

  function removeItem(evt,elem) {
    dispatch("removeItem",elem.id);
  }

  function dragItem(evt, elem) {
    for(var key in elem.dragData) {
      evt.dataTransfer.setData(key, elem.dragData[key]);
    }
    evt.stopPropagation();
  }

  function toggleHiddenEditorItems(e, elem) {
  	dispatch("toggleHidden", null);
  }

  function addItem(e, elem) {
    dispatch(elem.event, {});
  }

  function selectEditorItem(e, elem) {
    dispatch("selectItem", elem);
  }

  function closeSelectEditorItem(e, elem) {
    dispatch("closeAndSelectItem", elem);
  }

  export function toggleMenu() {
    dispatch("toggleMenu", null);
  }
}