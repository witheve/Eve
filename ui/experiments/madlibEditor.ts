/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/tableEditor.ts" />
/// <reference path="../src/glossary.ts" />
/// <reference path="../src/layout.ts" />

module madlib {

  declare var Papa;
  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;
  const render = drawn.render;

  const MAX_COMPLETIONS = 4;
  const NO_SELECTION = 0;

  enum SelectionType { blank, madlib, cell, heterogenous, none }
  enum SelectionSize { single, multi, none }

  enum MultiInputMode { query, add, remove }

  enum FocusType { adderRow, blank, multiInput, none }

  function initLocalstate() {
    localState.search = {mode: MultiInputMode.query, value: false, selected: NO_SELECTION, completions: []};
    localState.notebook = {activeCellId: 0, containerCell: "root"};
    localState.selection = {type: SelectionType.none, size: SelectionSize.none, items: []};
    localState.focus = {type: FocusType.none};
    localState.intermediateFacts = {};
  }

  function isSelected(selectionInfo) {
    for(let item of localState.selection.items) {
      let found = true;
      for(let field in selectionInfo) {
        if(selectionInfo[field] !== item[field]) {
          found = false;
          break;
        }
      }
      if(found) return true;
    }
    return false;
  }

  function dispatch(event, info, rentrant = false) {
    var diffs = [];
    var commands = [];
    var storeEvent = true;

    switch(event) {
      case "setMadlibSearch":
        localState.search.value = info.value;
        localState.search.completions = getCompletions(info.value);
        break;
      case "setActiveCell":
        localState.notebook.activeCellId = info.cellId;
        break;

      case "searchSelect":
        let size = Math.min(MAX_COMPLETIONS, localState.search.completions.length)
        localState.search.selected += info.direction;
        if(localState.search.selected < NO_SELECTION) {
          localState.search.selected = size;
        } else if(localState.search.selected > size) {
          localState.search.selected = NO_SELECTION;
        }
        break;
      case "clearSearch":
        localState.search.value = "";
        localState.search.selected = NO_SELECTION;
        localState.search.completions = [];
        break;
      case "submitSearch":
        var viewId;
        // if there's no selection and we try to submit an empty search
        // we're getting out of the current cell
        if(info.selected === NO_SELECTION && info.value === "") {
          localState.notebook.activeCellId = 0;
          break;
          // if we are selecting the very last thing, we are doing an add of a new
          // madlib
        } if(info.selected === info.completions.length || info.selected === MAX_COMPLETIONS) {
          let result = madlibFactsFromString(info.value);
          diffs = result.diffs;
          viewId = result.viewId;
          // otherwise, complete to the current selection
        } else {
          viewId = info.completions[info.selected].viewId;
        }
        if(info.mode === MultiInputMode.query) {
          let activeCellId = localState.notebook.activeCellId;
          let activeCell = ixer.selectOne("notebook cell", {cell: activeCellId});
          let queryId;
          //if the current cell is not a join cell
          if(!activeCell || activeCell["notebook cell: kind"] !== "query") {
            queryId = uuid();
            diffs.push(api.insert("view", {view: queryId, kind: "join"}));
            let cell = createCell(localState.notebook.containerCell, "query", queryId);
            diffs.push.apply(diffs, cell.diffs);
            //set the active cell
            localState.notebook.activeCellId = cell.cellId;
          } else {
            queryId = ixer.selectOne("notebook cell view", {cell: activeCellId})["notebook cell view: view"];
          }
          //add this as a source
          diffs.push.apply(diffs, addSource(queryId, viewId))
          // @TODO: sources need a stable order
        } else if(info.mode === MultiInputMode.add || info.mode === MultiInputMode.remove) {
          let type = info.mode === MultiInputMode.add ? "add" : "remove";
          //create a cell that is adding to this view
          let cell = createCell(localState.notebook.containerCell, type, viewId);
          diffs.push.apply(diffs, cell.diffs);
          //set the active cell
          localState.notebook.activeCellId = cell.cellId;
        }
        diffs.push.apply(diffs, dispatch("clearSearch", {}, true));
        break;

      case "updateAdderRow":
        var {viewId, fieldId, row, value} = info;
        if(!localState.intermediateFacts[viewId]) {
          let curRow = {};
          // @TODO: account for field types.
          ixer.getFields(viewId).forEach((fieldId) => {
            curRow[fieldId] = "";
          });
          localState.intermediateFacts[viewId] = curRow;
        }
        localState.intermediateFacts[viewId][fieldId] = value;
        break;
      case "submitAdderRow":
        var {viewId, fieldId, row, value} = info;
        var currentFact = localState.intermediateFacts[viewId];
        if(currentFact) {
          diffs.push(api.insert(viewId, currentFact, undefined, true));
          localState.intermediateFacts[viewId] = null;
          localState.focus = {type: FocusType.adderRow, viewId};
        }
        break;
      case "extendSelection":
        var selection = localState.selection;
        var {type, shiftKey, selectionInfo} = info;
        selectionInfo["type"] = type;
        // check if this is already selected
        if(isSelected(selectionInfo)) {
          // @TODO: this should deselect if shiftKey is true
          break;
        }
        // check if we're adding to an already existing selection
        if(shiftKey && selection.type !== SelectionType.none) {
          if(type !== SelectionType.blank) {
            selection.type = SelectionType.heterogenous;
          }
          selection.size = SelectionSize.multi;
          // otherwise we nuke whatever is there and move on
        } else {
          selection.type = type;
          selection.size = SelectionSize.single;
          selection.items = [];
        }
        selection.items.push(selectionInfo);
        break;
      case "clearSelection":
        localState.selection = {
          type: SelectionType.none,
          size: SelectionType.none,
          items: [],
        }
        break;
      case "joinBlanks":
        var {blanks} = info;
        var variables = {};
        var rootVariable;
        // since multiple fields with the same variable could be selected,
        // we need to dedupe them. We also need to select a rootVariable that
        // all the selected blanks will end up bound to.
        for(let blank of blanks) {
          let variableInfo = blankToVariable(blank);
          if(!rootVariable) {
            rootVariable = variableInfo;
          } else {
            variables[variableInfo.variable] = variableInfo;
          }
        }
        // go through each variable and join it to the rootVariable
        for(let toVariable in variables) {
          // @TODO: account for isInput which is used in joinNodes
          var nodeInfo = {
            node: rootVariable,
            target: variables[toVariable],
          }
          diffs.push.apply(diffs, drawn.dispatch("joinNodes", nodeInfo, true));
        }
        break;
      case "unjoinBlanks":

        break;
      case "updateFilter":
        var {variableId, value} = info;
        diffs.push(api.remove("constant binding", {variable: variableId}));
        diffs.push(api.insert("constant binding", {variable: variableId, value}));
        break;
      case "unfilterBlanks":
        var selection = localState.selection;
        if(selection.size !== SelectionSize.single) {
          throw new Error("You can only remove a filter on a single blank");
        }

        for(let blank of info.blanks) {
          let variableInfo = blankToVariable(blank);
          diffs.push(api.remove("constant binding", {variable: variableInfo.variable}));
        }
        break;
      case "filterBlanks":
        var selection = localState.selection;
        if(selection.size !== SelectionSize.single) {
          throw new Error("You can only add a filter on a single blank");
        }

        for(let blank of info.blanks) {
          let variableInfo = blankToVariable(blank);
          // @TODO: when you can scroll through results, we can't just always take
          // the first row. We should filter based on whatever the visible value of
          // the blank currently is.
          let row = ixer.selectOne(variableInfo.viewId, {});
          let value = "";
          if(row && row[variableInfo.fieldId] !== undefined) {
            value = row[variableInfo.fieldId];
          }
          diffs.push(api.insert("constant binding", {variable: variableInfo.variable, value}));
        }
        break;
      default:
        return drawn.dispatch(event, info, rentrant);
        break;
    }

    if(!rentrant) {
      if(diffs.length || commands.length) {
        let formatted = api.toDiffs(diffs);
        if(storeEvent && formatted.length) {
          eveEditor.storeEvent(localState.drawnUiActiveId, event, formatted);
        }
        ixer.handleDiffs(formatted);
        client.sendToServer(formatted, false, commands);
      }
      render();
    }
    return diffs;
  }

  function blankToVariable(blank) {
    let variableId = ixer.selectOne("binding", {source: blank.sourceId, field: blank.fieldId})["binding: variable"];
    return getVariableInfo(variableId);
  }

  function addSource(queryId, sourceViewId) {
    let sourceId = uuid();
    let diffs = [
      api.insert("source", {view: queryId, source: sourceId, "source view": sourceViewId})
    ];
    // add variables for all the fields of this view
    ixer.select("field", {view: sourceViewId}).forEach(function(field) {
      let fieldId = field["field: field"];
      let name = code.name(fieldId);
      // check if we should try to join this field to one of the potential join nodes
      // otherwise we need to create a variable for this field
      diffs.push.apply(diffs, drawn.addSourceFieldVariable(queryId, sourceViewId, sourceId, fieldId));
    });
    return diffs;
  }

  function createCell(parent, cellType, viewId?) {
    let diffs = [];
    let cellId = uuid();
    diffs.push(api.insert("notebook cell", {cell: cellId, kind: cellType}));
    diffs.push(api.insert("related notebook cell", {cell: parent, cell2: cellId}));
    // @TODO: notebook cell order
    if(viewId) {
      diffs.push(api.insert("notebook cell view", {cell: cellId, view: viewId}));
    }
    return {diffs, cellId};
  }

  function madlibFactsFromString(str, viewKind = "table") {
    let diffs = [];
    let parts = str.split("_");
    let viewId = uuid();
    diffs.push(api.insert("view", {view: viewId, kind: viewKind}))
    parts.forEach((part, ix) => {
      let cleanedPart = part.trim();
      // Empty strings occur when there's a blank at the beginning of the string,
      // at the end of the string, or spaces in between blanks. In any of these
      // cases we don't want a madlib string.
      if(cleanedPart !== "") {
        diffs.push(api.insert("madlib descriptor", {view: viewId, ix, content: cleanedPart}));
      }
      // if we're not looking at the last thing, then we have a field in between
      // this and the next string
      if(ix + 1 < parts.length) {
        var neueField = api.insert("field", {view: viewId, kind: "output", dependents: {
          "display name": {name: "blank"},
          "display order": {priority: ix + 0.5},
        }});
        diffs.push(neueField);
      }
    });
    return {diffs, viewId};
  }

  export function root() {
    var page:any;
    return {id: "root", c: localStorage["theme"] || "light", children: [
      drawn.tooltipUi(),
      drawn.notice(),
      {c: "workspace", children: [
        workspaceTools(),
        workspaceCanvas(),
      ]}
    ]};
  }

  function workspaceTools() {
    let actions = {
      "join": {func: joinBlanks, text: "Link", description: "Link the blanks", semantic: "action::join"},
      "unfilter": {func: unfilterBlanks, text: "Unfilter", semantic: "action::unfilter"},
      "filter": {func: filterBlanks, text: "Filter", semantic: "action::filter"},
    };
    let disabled = {};
    return drawn.leftToolbar(actions, disabled);
  }

  function filterBlanks(e, elem) {
    dispatch("filterBlanks", {blanks: localState.selection.items});
  }

  function unfilterBlanks(e, elem) {
    dispatch("unfilterBlanks", {blanks: localState.selection.items});
  }

  function joinBlanks(e, elem) {
    dispatch("joinBlanks", {blanks: localState.selection.items});
  }

  function workspaceCanvas() {
    let activeCellId = localState.notebook.activeCellId;
    let cells = ixer.select("related notebook cell", {cell: localState.notebook.containerCell}).map((related) => {
      let cellId = related["related notebook cell: cell2"];
      let cell = ixer.selectOne("notebook cell", {cell: cellId});
      let kind = cell["notebook cell: kind"];
      let item;
      if(kind === "add" || kind === "remove") {
        let viewId = ixer.selectOne("notebook cell view", {cell: cellId})["notebook cell view: view"];
        item = tableItem(viewId);
      } else if(kind === "query") {
        let viewId = ixer.selectOne("notebook cell view", {cell: cellId})["notebook cell view: view"];
        item = joinItem(viewId);
      }
      if(cellId === activeCellId) {
        item.c += " active";
        item.children.push(multiInput());
      }
      item.click = setActiveCell;
      item.cellId = cellId;
      return item;
    });
    if(activeCellId === 0) {
      cells.push(multiInput());
    }
    return {c: "canvas", mousedown: maybeClearSelection, children: cells};
  }

  function maybeClearSelection(e, elem) {
    if(!e.target.classList.contains("value") && !e.shiftKey) {
      dispatch("clearSelection", {});
    }
  }

  function setActiveCell(e, elem) {
    dispatch("setActiveCell", {cellId: elem.cellId});
  }

  function extractSourceValuesFromResultRow(resultRow, sourceId) {
    if(!resultRow) return;
    let bindings = ixer.select("binding", {source: sourceId});
    let result = {};
    for(let binding of bindings) {
      let variableId = binding["binding: variable"];
      let sourceField = binding["binding: field"];
      let select = ixer.selectOne("select", {variable: variableId});
      if(select) {
        let resultField = select["select: field"];
        result[sourceField] = resultRow[resultField];
      } else {
        result[sourceField] = "";
      }
    }
    return result;
  }

  function joinItem(viewId) {
    let results = ixer.select(viewId, {});
    let joinInfo = getJoinInfo(viewId);
    let sources = ixer.select("source", {view: viewId}).map((source) => {
      let sourceId = source["source: source"];
      let sourceView = source["source: source view"];
      let sourceRow = extractSourceValuesFromResultRow(results[0], sourceId);
      return madlibForView(sourceView, {
        rows: [sourceRow],
        joinInfo: joinInfo[sourceId],
        selectable: true,
        onSelect: selectBlank,
        sourceId,
      });
    });
    sources.push({text: `${results.length} results`})
    return {c: "item", children: sources};
  }

  function selectBlank(e, elem) {
    dispatch("extendSelection", {
      shiftKey: e.shiftKey,
      type: SelectionType.blank,
      selectionInfo: {
        fieldId: elem.fieldId,
        sourceId: elem.opts.sourceId
      }
    });
    //e.preventDefault();
  }

  function tableItem(viewId) {
    return {c: "item", children: [
      madlibForView(viewId, {
        rows: ixer.select(viewId, {}),
        editable: true

      })
    ]};
  }


  function multiInput() {
    let mode = localState.search.mode;
    return {c: "multi-input", children: [
      {c: "switcher", children: [
        {c: "switcher-value", text: mode === MultiInputMode.query ? "?" : "+"},
        {c: "options", children: [
          {text: "add"},
          {text: "find"},
        ]}
      ]},
      madlibEditor(),
    ]}
  }

  function madlibEditor() {
    let searchValue = localState.search.value;
    let completions = localState.search.completions;
    let selected = completions[localState.search.selected];
    let focus = false;
    let currentMadlib =  {t: "table", c: "madlib-table", children: [
      {t: "tr", c: "madlib", children: [
        {t: "td", c: "madlib-blank", children: [
          {c: "madlib-text", postRender: drawn.focusOnce, contentEditable: true, text: searchValue || "", input: setMadlibSearch, keydown: cellKeyDown},
        ]}
      ]}
    ]};
    return {c: "madlib-searcher", children: [
      currentMadlib,
      completionList(completions),
    ]};
  }

  function setMadlibSearch(e, elem) {
    dispatch("setMadlibSearch", {value: e.currentTarget.textContent});
  }

  function cellKeyDown(e, elem) {
    if(e.keyCode === api.KEYS.TAB) {
      dispatch("cellTab", {});
      e.preventDefault();
    } else if(e.keyCode === api.KEYS.DOWN) {
      dispatch("searchSelect", {direction: 1});
      e.preventDefault();
    } else if(e.keyCode === api.KEYS.UP) {
      dispatch("searchSelect", {direction: -1});
      e.preventDefault();
    } else if(e.keyCode === api.KEYS.ENTER) {
      dispatch("submitSearch", {shift: e.shiftKey, mode: localState.search.mode, value: localState.search.value, selected: localState.search.selected, completions: localState.search.completions});
      e.preventDefault();
    }
    e.stopPropagation();
  }

  function getCompletions(searchValue) {
    // find all the madlibs that match
    let results = [];
    if(searchValue !== false) {
      let searchWords = searchValue.trim().split(" ");
      // since we have views without madlibs at the moment, search
      // view names as well
      let views = ixer.select("view", {});
      for(let view of views) {
        let score = 0;
        let viewId = view["view: view"];
        let descriptors = ixer.select("madlib descriptor", {view: viewId}).map((desc) => desc["madlib descriptor: content"]);
        let viewName = code.name(viewId) + " " + descriptors.join(" ");
        for(let word of searchWords) {
          let wordIx = viewName.indexOf(word);
          if(wordIx > -1) {
            if(viewName[wordIx - 1] === " " || viewName[wordIx + 1 + word.length] === " ") {
              score += 1;
            }
            score += 1;
          }
        }
        if(score > 0) {
          results.push({viewId, score});
        }
      }
      results.sort((a, b) => {
        return b.score - a.score;
      });
    }
    return results;
  }

  function completionList(results) {
    if(results && results.length) {
      let searchSelected = localState.search.selected;
      let displayResults = results.slice(0, MAX_COMPLETIONS).map((result, ix) => {
        let {viewId, score} = result;
        let madlib = madlibForView(viewId, {
          rows: [ixer.selectOne(viewId, {})]
        });
        madlib.selectedIndex = ix;
        madlib.click = submitCompletion;
        madlib.score = score;
        if(ix === searchSelected) {
          madlib.c += " selected";
        }
        return madlib;
      });
      // if the selected index is the size of the results, then we've selected the very
      // last thing, which is the add option
      let isAddSelected = searchSelected === displayResults.length;
      let addClass = isAddSelected ? "selected" : "";
      displayResults.push({c: addClass, text: "Add new fact type"});
      return {c: "completions", children: displayResults}
    }
  }

  function submitCompletion(e, elem) {
    dispatch("submitSearch", {selected: elem.selectedIndex, completions: localState.search.completions})
  }

  function madlibRow(viewId, madlibBlanks, row, opts) {
    let {joinInfo = {}, editable = false, focus = false, selectable = false} = opts;
    let focused = false;
    let items = madlibBlanks.map((descriptor) => {
      if(descriptor["madlib descriptor: content"]) {
        return {t: "td", c: "madlib-blank", children: [
          {c: "madlib-text", text: descriptor["madlib descriptor: content"]}
        ]};
      } else {
        let fieldId = descriptor["field: field"];
        let name = code.name(fieldId);
        let value = row[fieldId] !== undefined ? row[fieldId] : "";
        let field:any = {c: "value", contentEditable: editable, row, fieldId, viewId, opts,
                         input: opts.onInput, keydown: opts.onKeydown, mousedown: opts.onSelect, text: value};
        let blankClass = "madlib-blank";
        // @TODO: make focusing work
        if(focus && !focused) {
          field.postRender = drawn.focusOnce;
          focused = true;
        }
        if(selectable && isSelected({type: SelectionType.blank, fieldId, sourceId: opts.sourceId})) {
          blankClass += " selected";
        }
        let fieldInfo = joinInfo[fieldId];
        if(fieldInfo) {
          blankClass += ` ${fieldInfo.color}`;
          if(fieldInfo.constantValue !== undefined) {
            blankClass += " filtered";
            field.text = fieldInfo.constantValue;
            field.contentEditable = true;
            field.keydown = updateFilter;
            field.variable = fieldInfo;
          }
        }
        return {t: "td", c: blankClass, children: [
          field,
        ]}
      }
    });
    return {t: "tr", c: "madlib", children: items};
  }

  function updateFilter(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      dispatch("updateFilter", {value: drawn.coerceInput(e.currentTarget.textContent), variableId: elem.variable.variable});
      e.preventDefault();
    }
  }

  function madlibForView(viewId, opts:any = {}): any {
    let {rows = [], joinInfo = {}, editable = false, adder = false, focus = false} = opts;
    // if we don't have any rows to draw, draw everything as empty
    if(!editable && (!rows.length || rows[0] === undefined)) {
      rows = [{}];
    }

    // we draw a madlib based on a combination of descriptors and fields, which are
    // ordered against eachother
    let descriptors = ixer.select("madlib descriptor", {view: viewId});
    let madlibBlanks = ixer.select("field", {view: viewId}).concat(descriptors);
    madlibBlanks.sort((a, b) => {
      var aIx = a["madlib descriptor: ix"] || ixer.selectOne("display order", {id: a["field: field"]})["display order: priority"];
      var bIx = b["madlib descriptor: ix"] || ixer.selectOne("display order", {id: b["field: field"]})["display order: priority"];
      return aIx - bIx;
    });
    if(!descriptors.length) {
      madlibBlanks.unshift({"madlib descriptor: content": code.name(viewId)});
    }

    var sort = {
      field: ixer.getFields(viewId)[0],
      dir: 1
    }
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

    // for each row we're supposed to render, draw the madlib
    let rowItems = rows.map((row) => {
      return madlibRow(viewId, madlibBlanks, row, opts);
    });

    if(editable) {
      let focus = localState.focus;
      let isFocused = focus.type === FocusType.adderRow && focus.viewId === viewId;
      rowItems.push(madlibRow(viewId, madlibBlanks, {}, {
        editable: true,
        focus: isFocused,
        joinInfo: joinInfo,
        sourceId: opts.sourceId,
        onInput: adderRowUpdate,
        onKeydown: adderRowKey,
      }));
    }

    // the final madlib is a table of all the madlib items
    return {c: "madlib-container", children: [
      {t: "table", c: "madlib-table", debug: viewId, children: rowItems}
    ]};
  }

  function adderRowUpdate(e, elem) {
    dispatch("updateAdderRow", {viewId: elem.viewId, fieldId: elem.fieldId, row: elem.row,
                                value: drawn.coerceInput(e.currentTarget.textContent)});
  }

  function adderRowKey(e, elem) {
    if(e.keyCode === api.KEYS.ENTER) {
      dispatch("submitAdderRow", {viewId: elem.viewId, fieldId: elem.fieldId, row: elem.row,
                                  value: drawn.coerceInput(e.currentTarget.textContent)});
      e.preventDefault();
    }
  }

  window["drawn"].root = root;

  function getVariableInfo(variableId, colors?) {
    let viewId = ixer.selectOne("variable", {variable: variableId})["variable: view"];
    let bindings = ixer.select("binding", {variable: variableId});
    let constants = ixer.select("constant binding", {variable: variableId});
    let ordinals = ixer.select("ordinal binding", {variable: variableId});
    let select = ixer.selectOne("select", {variable: variableId});
    let variable:any = {variable: variableId, viewId};

    variable.bindings = bindings;

    if(select) {
      variable.fieldId = select["select: field"];
    }

    if(constants.length) {
      variable.filtered = true;
      variable.constantValue = constants[0]["constant binding: value"];
    }

    // run through the bindings once to determine if it's an entity, what it's name is,
    // and all the other properties of this node.
    for(let binding of bindings) {
      let fieldId = binding["binding: field"];
      let field = ixer.selectOne("field", {field: fieldId});
      if(field["field: kind"] !== "output") {
        variable.isInput = true;
      }
    }
    return variable;
  }


  function getJoinInfo(joinId) {
    // This translates our normalized AST into a set of denomralized graphical nodes.
    var colors = ["blue", "purple", "green", "orange", "teal", "red"];
    var sourceFieldToVariable = {};
    let variables = ixer.select("variable", {view: joinId});
    for(let variableRow of variables) {
      let variableId = variableRow["variable: variable"];
      let variableInfo = getVariableInfo(variableId, colors);
      if(variableInfo.bindings.length > 1) {
        variableInfo.color = colors.shift();
      }
      for(let binding of variableInfo.bindings) {
        let sourceId = binding["binding: source"];
        let fieldId = binding["binding: field"];
        if(!sourceFieldToVariable[sourceId]) {
          sourceFieldToVariable[sourceId] = {};
        }
        sourceFieldToVariable[sourceId][fieldId] = variableInfo;
      }
    }
    return sourceFieldToVariable;
  }

  client.afterInit(() => {
    initLocalstate();
  });
}


