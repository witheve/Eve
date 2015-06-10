/// <reference path="query-editor.ts" />
module tableEditor {
  declare var api;
  var ixer = api.ixer;
  var code = api.code;
  var localState = api.localState;
  var KEYS = api.KEYS;
  var dispatch = queryEditor.dispatch;
  //---------------------------------------------------------
  // Table workspace
  //---------------------------------------------------------

  function getLocalFieldName(fieldId) {
    var calculatedId = ixer.index("field to calculated field")[fieldId];
    if (calculatedId) {
      return code.name(calculatedId);
    } else {
      return code.name(fieldId);
    }
  }
  
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

  export function tableWorkspace(tableId) {
    var order = ixer.index("display order");
    var fields = (ixer.index("view to fields")[tableId] || []).map(function(field) {
      var id = field[code.ix("field", "field")];
      return { name: getLocalFieldName(id), id: id, priority: order[id] || 0 };
    });
    fields.sort(function(a, b) {
      var delta = b.priority - a.priority;
      if (delta) { return delta; }
      else { return a.id.localeCompare(b.id); }
    });

    var rows = ixer.facts(tableId);
    rows.sort(function(a, b) {
      var aIx = order[tableId + JSON.stringify(a)] || 0;
      var bIx = order[tableId + JSON.stringify(b)] || 0;
      return aIx - bIx;
    });
    return queryEditor.genericWorkspace("",
      tableId,
      {
        c: "table-editor",
        children: [
          virtualizedTable(tableId, fields, rows, true)
        ]
      });
  }

  export function rename(e, elem, sendToServer) {
    var value = e.currentTarget.textContent;
    if (value !== undefined) {
      dispatch("rename", { value: value, id: elem.key, sendToServer: sendToServer, initial: [localState.initialKey, localState.initialValue] });
    }
  }

  export function virtualizedTable(id, fields, rows, isEditable) {
    var ths = fields.map(function(cur) {
      var oninput, onsubmit;
      if (cur.id) {
        oninput = onsubmit = rename;
      }
      var isKey = code.hasTag(cur.id, "key") ? "isKey" : "";
      return {
        c: "header", children: [input(cur.name, cur.id, oninput, onsubmit),
          { c: "ion-key key" + isKey, click: toggleKey, fieldId: cur.id }]
      };
    });
    if (isEditable) {
      ths.push({ c: "header add-column ion-plus", click: addField, table: id });
    }
    var trs = [];
    rows.forEach(function(cur, rowIx) {
      var tds = [];
      for (var tdIx = 0, len = fields.length; tdIx < len; tdIx++) {
        tds[tdIx] = { c: "field" };
        
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
      var adderRows = localState.adderRows;
      adderRows.forEach(function(cur, rowNum) {
        var tds = [];
        for (var i = 0, len = fields.length; i < len; i++) {
          tds[i] = {c: "field", children: [input(cur[i], { row: cur, numFields: len, priority: rowNum, fieldIx: i, view: id }, updateAdder, maybeSubmitAdder)] };
        }
        trs.push({c: "row", children: tds });
      });
    }
    //   trs.push({id: "spacer2", c: "spacer", height: Math.max(totalRows - start - numRows, 0) * itemHeight});
    return {
      c: "table", children: [
        { c: "headers", children: ths },
        { c: "rows", children: trs }
      ]
    };
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
    if (localState.adderRows.length <= 1) {
      localState.adderRows.push([]);
    }
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

  export function storeInitialInput(e, elem) {
    localState.initialKey = elem.key;
    localState.initialValue = elem.text;
  }
}