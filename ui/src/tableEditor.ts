/// <reference path="api.ts" />
module tableEditor {
  declare var uuid;
  declare var DEBUG;
  var ixer = api.ixer;
  var code = api.code;
  var diff = api.diff;
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
      case "rename":
        var id = info.id;
        sendToServer = !!info.sendToServer;
        if(info.value === undefined || info.value === info.initial[1]) { return; }
        diffs.push(["display name", "inserted", [id, info.value]],
                   ["display name", "removed", info.initial])
        break;

      case "addField":
        var fieldId = uuid();
        var ix = ixer.index("view to fields")[info.table].length;
        diffs.push(["field", "inserted", [info.table, fieldId, "output"]], // @NOTE: Can this be any other kind?
                   ["display name", "inserted", [fieldId, api.alphabet[ix]]],
                   ["display order", "inserted", [fieldId, -ix]]);
        var oldFacts = (ixer.facts(info.table) || []).slice();
        var neueFacts = oldFacts.map(function(fact) {
          var neue = fact.slice();
          neue.push("");
          var oldKey = info.table + JSON.stringify(fact);
          var neueKey = info.table + JSON.stringify(neue);
          var priority = ixer.index("display order")[oldKey];
          if(priority === undefined) { throw new Error("Row " + oldKey + " has no priority."); }
          diffs.push(["display order", "removed", [oldKey, priority]],
                     ["display order", "inserted", [neueKey, priority]]);

          return neue;
        });
        ixer.clearTable(info.table); // @HACKY way to clear the existing indexes.
        setTimeout(function() {
          dispatch("replaceFacts", {table: info.table, neue: neueFacts});
        }, 1000);
        break;
      case "replaceFacts":
        var diffs = [];
        diffs = diffs.concat((info.old || []).map(function(fact) {
          return [info.table, "removed", fact];
        }));
        diffs = diffs.concat((info.neue || []).map(function(fact) {
          return [info.table, "inserted", fact];
        }));
        break;
      case "addRow":
        var ix:any = ixer.facts(info.table).length || 0;
        diffs.push([info.table, "inserted", info.neue],
                   ["display order", "inserted", [info.table + JSON.stringify(info.neue), ix]]);
        break;
      case "updateRow":
        sendToServer = info.submit;
        var oldString = info.table + JSON.stringify(info.old);
        var ix = info.priority;
        if(ix === undefined) {
          console.error("No ix specified for", oldString);
          ix = 0;
        }
        var neueString = info.table + JSON.stringify(info.neue);
        if(oldString === neueString) return;
        diffs.push([info.table, "inserted", info.neue],
                   ["display order", "inserted", [neueString, ix]]);
        if(info.old) {
          diffs.push([info.table, "removed", info.old],
          ["display order", "removed", [oldString, ix]]);
        }
        break;
      case "toggleKey":
        var isKey = code.hasTag(info.fieldId, "key");
        if(isKey) {
          diffs.push(["tag", "removed", [info.fieldId, "key"]]);
        } else {
          diffs.push(["tag", "inserted", [info.fieldId, "key"]]);
        }
        break;
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

  function coerceInput(input) {
    if(input.match(/^-?[\d]+$/gim)) {
      return parseInt(input);
    } else if(input.match(/^-?[\d]+\.[\d]+$/gim)) {
      return parseFloat(input);
    } else if(input === "true") {
      return true;
    } else if(input === "false") {
      return false;
    }
    return input;
  }

  export function tableForView(viewId, editable = false, limit:any = false) {
    var fields = (ixer.getFields(viewId) || []).map(function(fieldId, ix) {
      return { name: getLocalFieldName(fieldId), id: fieldId, priority: ix };
    });

    var rows = ixer.facts(viewId);
    if(limit !== false) {
      rows = rows.slice(0, limit);
    }
    return virtualizedTable(viewId, fields, rows, editable);
  }

  function openTableQuery(evt, elem) {
    dispatch("createTableStateQuery", elem);
  }

  export function rename(e, elem, sendToServer) {
    var value = e.currentTarget.textContent;
    if (value !== undefined) {
      dispatch("rename", { value: value, id: elem.key, sendToServer: sendToServer, initial: [localState.initialKey, localState.initialValue] });
    }
  }

  export function virtualizedTable(id, fields, rows, isEditable) {
    var sort = localState.sort[id] || {};
    if(!sort.field && fields.length) {
      sort.field = fields[0].id;
      sort.dir = 1;
    }
    var sortIx = 0;
    for(let fieldIx = 0, fieldsLength = fields.length; fieldIx < fieldsLength; fieldIx++) {
      if(fields[fieldIx].id === sort.field) {
        sortIx = fieldIx;
        break;
      }
    }

    var ths = fields.map(function(cur) {
      var oninput, onsubmit;
      if (cur.id) {
        oninput = onsubmit = rename;
      }
      var isKey = code.hasTag(cur.id, "key") ? " active" : "";
      var sortClass = "icon " + ((sort.dir === 1 || sort.field !== cur.id) ? "ion-android-arrow-dropdown" : "ion-android-arrow-dropup");
      if(sort.field === cur.id) {
        sortClass += " active";
      }
      return {
        c: "header", children: [
          input(cur.name, cur.id, oninput, onsubmit),
          { c: "ion-key icon" + isKey, click: toggleKey, fieldId: cur.id },
          { c: sortClass, click: setTableSort, tableId: id, fieldId: cur.id}
        ]
      };
    });
    if (isEditable) {
      ths.push({ c: "header add-column ion-plus", click: addField, table: id });
    }
    var trs = [];
    if(sort.field) {
      rows.sort(function sortAscending(a, b) {
        a = a[sortIx];
        b = b[sortIx];
        if(sort.dir === -1) { [a, b] = [b, a]; }
        var typeA = typeof a;
        var typeB = typeof b;
        if(typeA === typeB && typeA === "number") { return a - b; }
        if(typeA === "number") { return -1; }
        if(typeB === "number") { return 1; }
        if(typeA === "undefined") { return -1; }
        if(typeB === "undefined") { return 1; }
        if(a.constructor === Array) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); }
        return a.localeCompare(b);
      });
    }
    rows.forEach(function(cur, rowIx) {
      var tds = [];
      for (var tdIx = 0, len = fields.length; tdIx < len; tdIx++) {
        tds[tdIx] = { c: "field", contextmenu: (DEBUG.TABLE_CELL_LOOKUP ? lookupDisplayName: undefined) };

        // @NOTE: We can hoist this if perf is an issue.
        if (isEditable) {
          tds[tdIx].children = [input(cur[tdIx], { priority: rowIx, numFields: len, row: cur, fieldIx: tdIx, view: id }, updateRow, submitRow)];
        } else {
          tds[tdIx].text = cur[tdIx];
        }
      }
      trs.push({c: "row", children: tds });
    })
    if (isEditable) {
      var adderRows = ensureAdderRows(id);
      adderRows.forEach(function(cur, rowNum) {
        var tds = [];
        for (var i = 0, len = fields.length; i < len; i++) {
          tds[i] = {c: "field", children: [input(cur[i], { row: cur, numFields: len, priority: rowNum, fieldIx: i, view: id }, updateAdder, maybeSubmitAdder)] };
        }
        trs.push({c: "row", children: tds });
      });
    }
    //   trs.push({id: "spacer2", c: "spacer", height: Math.max(totalRows - start - numRows, 0) * itemHeight});
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

  function ensureAdderRows(viewId) {
    if(!localState.adderRows || localState.adderItemId !== viewId) {
      localState.adderRows = [];
      localState.adderItemId = viewId;
    }
    if(localState.adderRows.length >= 2) { return localState.adderRows; }

    var fieldIds = api.ixer.getFields(viewId);
    var autoIncrement = api.code.hasTag(fieldIds[0], "auto increment");
    if(autoIncrement) {
      var nextId = (api.ixer.facts(viewId, true) || []).length + 1 + localState.adderRows.length;
    }
    while(localState.adderRows.length < 2) {
      if(autoIncrement) {
        localState.adderRows.push([nextId++]);
      } else {
        localState.adderRows.push([]);
      }
    }
    return localState.adderRows;
  }

  function setTableSort(evt, elem) {
    var sort = localState.sort[elem.tableId];
    var dir = 1;
    if(sort && sort.field === elem.fieldId) {
      dir = -sort.dir;
    }
    dispatch("setTableSort", {table: elem.tableId, field: elem.fieldId, dir: dir});
  }

  function toggleKey(e, elem) {
    dispatch("toggleKey", { fieldId: elem.fieldId });
  }

  function addField(e, elem) {
    dispatch("addField", { table: elem.table });
  }

  function updateAdder(e, elem) {
    var key = elem.key;
    var row = localState.adderRows[key.priority];
    row[key.fieldIx] = coerceInput(e.currentTarget.textContent);
  }

  function checkRow(row, numFields): boolean {
    if (row.length !== numFields) { return false; }
    //check to see if the row is complete. If not, we're done here.
    for(var cell of row) {
      if(cell === undefined || cell === null) {
        return false;
      }
    }
    return true;
  }

  function maybeSubmitAdder(e, elem, type) {
    var key = elem.key;
    var row = localState.adderRows[key.priority];
    row[key.fieldIx] = coerceInput(e.currentTarget.textContent);
    if(!checkRow(row, key.numFields)) return;
    var hasAtLeastOneValue = row.some((cur) => {
      return cur !== "";
    });
    if(!hasAtLeastOneValue) return;
    localState.adderRows.splice(key.priority, 1);
    dispatch("addRow", { table: key.view, neue: row });
  }

  function updateRow(e, elem) {
    var neue = elem.key.row.slice();
    neue[elem.key.fieldIx] = coerceInput(e.currentTarget.textContent);
    dispatch("updateRow", { table: elem.key.view, priority: localState.initialKey.priority, old: elem.key.row.slice(), neue: neue, submit: false })
  }

  function submitRow(e, elem, type) {
    var neue = elem.key.row.slice();
    neue[elem.key.fieldIx] = coerceInput(e.currentTarget.textContent);
    if(!checkRow(neue, elem.key.numFields)) return;
    dispatch("updateRow", { table: elem.key.view, priority: localState.initialKey.priority, old: localState.initialKey.row.slice(), neue: neue, submit: true })
  }

  export function input(value, key, oninput, onsubmit): any {
    var blur, keydown;
    if (onsubmit) {
      blur = function inputBlur(e, elem) {
        onsubmit(e, elem, "blurred");
      }
      keydown = function inputKeyDown(e, elem) {
        if (e.keyCode === KEYS.ENTER) {
          onsubmit(e, elem, "enter");
        }
      }
    }
    return { c: "input text-input", contentEditable: true, input: oninput, focus: storeInitialInput, text: value, key: key, blur: blur, keydown: keydown };
  }

  export function checkbox(value, key, onChange) {
    return {t: "input", type: "checkbox", c: "input checkbox-input", change: onChange, checked: value, key: key};
  }

  export function storeInitialInput(e, elem) {
    localState.initialKey = elem.key;
    localState.initialValue = elem.text;
  }
}