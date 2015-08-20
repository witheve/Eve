/// <reference path="api.ts" />
module tableEditor {
  declare var uuid;
  declare var DEBUG;
  var ixer = api.ixer;
  var code = api.code;
  var localState = api.localState;
  var KEYS = api.KEYS;

  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  function dispatch(event: string, info: any, rentrant?: boolean) {
     //         console.info("[dispatch]", evt, info);
    var storeEvent = true;
    var sendToServer = true;
    var txId = ++localState.txId;
  	var redispatched = false;
    var diffs = [];
    switch(event) {
      case "setTableSort":
        localState.sort[info.table] = {field: info.field, dir: info.dir};
        break;
      default:
        redispatched = true;
        drawn.dispatch(event, info);
        break;
    }
    if(!redispatched && !rentrant) {
      eveEditor.executeDispatch(diffs, storeEvent, sendToServer);
    }
  }

  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  var getLocalFieldName = code.name;

  export function tableForView(viewId, limit:any = false, opts = {}) {
    var fields = ixer.getFields(viewId) || [];
    var rows = ixer.select(viewId, {});
    if(limit !== false) {
      rows = rows.slice(0, limit);
    }
    return virtualizedTable(viewId, fields, rows, opts);
  }

  export function rename(e, elem, sendToServer) {
    var value = e.currentTarget.textContent;
    if (value !== undefined) {
      dispatch("rename", { value: value, id: elem.key, sendToServer: sendToServer, initial: [localState.initialKey, localState.initialValue] });
    }
  }

  export function virtualizedTable(id, fieldIds, rows, opts) {
    var sort = localState.sort[id] || {};
    if(!sort.field && fieldIds.length) {
      sort.field = fieldIds[0];
      sort.dir = 1;
    }

    var ths = fieldIds.map(function(fieldId) {
      let name = code.name(fieldId);
      var sortClass = "icon " + ((sort.dir === 1 || sort.field !== fieldId) ? "ion-android-arrow-dropdown" : "ion-android-arrow-dropup");
      if(sort.field === fieldId) {
        sortClass += " active";
      }
      return {c: "header", children: [
        {c: "input", contentEditable: true, fieldId, renameId: fieldId, blur: drawn.renameField, keydown: drawn.maybeSubmitRenameField, click: opts.onHeaderSelect, text: name},
        { c: sortClass, click: setTableSort, tableId: id, fieldId}
      ]};
    });
    var trs = [];
    if(sort.field) {
      rows.sort(function sortAscending(a, b) {
        a = a[sort.field];
        b = b[sort.field];
        if(sort.dir === -1) { [a, b] = [b, a]; }
        var typeA = typeof a;
        var typeB = typeof b;
        if(typeA === typeB && typeA === "number") { return a - b; }
        if(typeA === "number") { return -1; }
        if(typeB === "number") { return 1; }
        if(typeA === "undefined") { return -1; }
        if(typeB === "undefined") { return 1; }
        if(a.constructor === Array) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); }
        return a.toString().localeCompare(b.toString());
      });
    }
    rows.forEach(function(cur, rowIx) {
      var tds = [];
      let isActive = true;
      for(let fieldId of fieldIds) {
        let val = cur[fieldId];
        if(!opts.activeRow || opts.activeRow[fieldId] !== val) isActive = false;
        let td = { c: "field", row: cur, fieldId, click: opts.onSelect, contextmenu: (DEBUG.TABLE_CELL_LOOKUP ? lookupDisplayName: undefined) };
        if(val !== "") {
          td["text"] = val;
        } else {
          td["text"] = "<empty>";
          td["c"] += " empty-value";
        }
        tds.push(td);
      }
      let activeClass = isActive ? "active" : "";
      trs.push({c: `row ${activeClass}`, row: cur, click: opts.onSelect, children: tds });
    })
    return {c: "table-container", children: [
      {c: "table", children: [
        { c: "headers", children: ths },
        { c: "rows", children: trs }
      ]
      }
    ]};
  }

  function lookupDisplayName(evt) {
    var content = evt.target.textContent;
    console.log("text:", content);
    console.log(" - name:", (api.ixer.selectOnePretty("display name", {id: content}) || {})["name"]);
    console.log(" - order:", (api.ixer.selectOnePretty("display order", {id: content}) || {})["priority"]);
    console.log(" - tags:", api.ixer.selectPretty("tag", {view: content}).map((tag) => tag["tag"]));
  }

  function setTableSort(evt, elem) {
    var sort = localState.sort[elem.tableId];
    var dir = 1;
    if(sort && sort.field === elem.fieldId) {
      dir = -sort.dir;
    }
    dispatch("setTableSort", {table: elem.tableId, field: elem.fieldId, dir: dir});
  }
}
