/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/glossary.ts" />
/// <reference path="../src/ui.ts" />

module madlib {

  declare var Papa;
  declare var CodeMirror;
  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;
  const render = drawn.render;

  const MAX_COMPLETIONS = 4;
  const NO_SELECTION = 0;

  enum SelectionType { field, blank, madlib, cell, heterogenous, none }
  enum SelectionSize { single, multi, none }

  enum FocusType { adderRow, blank, none }

  function initLocalstate() {
    localState.notebook = {activeCellId: 0, containerCell: "root"};
    localState.selection = {type: SelectionType.none, size: SelectionSize.none, items: []};
    localState.focus = {type: FocusType.none};
    localState.input = {value: "", messageNumber: 0};
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
      case "setActiveCell":
        localState.notebook.activeCellId = info.cellId;
        localState.input.value = cellToString(info.cellId);
        break;
      case "setActiveUnionCell":
        localState.notebook.activeCellId = info.cellId;
        localState.input.value = ixer.selectOne("madlib", {view: info.unionId})["madlib: madlib"];
        break;
      case "trackChatInput":
        localState.input.value = info.value;
        break;
      case "submitQuery":
        var activeCellId = localState.notebook.activeCellId;
        if(!activeCellId && info.value === "") break;
        if(activeCellId && info.value === "") {
          return dispatch("removeCell", {cellId: activeCellId});
        }
        var items = parseMadlibsFromString(info.value);
        let activeCell = ixer.selectOne("notebook cell", {cell: activeCellId});
        // we always create a new query regardless of if it's an edit or an add
        // this means that we'll need to patch up any references to the previous
        // query, but it makes our changes much safer in the long run.
        let queryId = uuid();
        // @TODO: we really only need a view if there is a query in this cell,
        // in the case where it's just adds, we could get away without it.
        diffs.push(api.insert("view", {view: queryId, kind: "join"}));
        //if the current cell is not a join cell
        if(!activeCell || activeCell["notebook cell: kind"] !== "query") {
          let parentCellId = localState.notebook.containerCell;
          let order = relatedCellNextIndex(parentCellId);
          let cell = createCell(parentCellId, "query", order, queryId);
          activeCellId = cell.cellId;
          diffs.push.apply(diffs, cell.diffs);
        } else {
          // we need to point our cell to the new view
          diffs.push(api.remove("notebook cell view", {cell: activeCellId}));
          diffs.push(api.insert("notebook cell view", {cell: activeCellId, view: queryId}));
          // in the case where we're modifying a previous cell, we may eventually want to
          // remove the old view as it could cause us problems, but for now we'll leave it.
          // We do, however, need to remove any previous facts associated to this cell.
          // @TODO: should we remove the associated view if it's safe?
          diffs.push.apply(diffs, removeCellFacts(activeCellId));
        }
        diffs.push.apply(diffs, madlibParseItemsToDiffs(activeCellId, queryId, items));
        var originalView = ixer.selectOne("notebook cell view", {cell: activeCellId});
        if(originalView) {
          let originalViewId = originalView["notebook cell view: view"];
          // in the case where there are related cells, we need to adjust their bindings
          // if there are any.
          // @TODO: adjust bindings for charts
          let fieldMapping = itemFieldMapping(originalViewId, items);
          let relatedCells = ixer.select("related notebook cell", {cell: activeCellId});
          for(let relatedCell of relatedCells) {
            diffs.push.apply(diffs, remapRelatedCell(relatedCell, queryId, fieldMapping));
          }
        }

        localState.input.value = "";
        // if this isn't an edit of a previous cell, we need to increment the
        // messengerNumber, which is used primarily to scroll the window to the
        // bottom in the case of submitting something new.
        if(!activeCell) {
          localState.input.messageNumber += 1;
        }
        // we're now done with whatever cell was active
        localState.notebook.activeCellId = 0;
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
        var {selectionInfo, shiftKey} = info;
        // check if this is already selected
        if(isSelected(selectionInfo)) {
          // @TODO: this should deselect if shiftKey is true
          break;
        }
        // check if we're adding to an already existing selection
        if(shiftKey && selection.type !== SelectionType.none) {
          if(selectionInfo.type !== selection.type) {
            selection.type = SelectionType.heterogenous;
          }
          selection.size = SelectionSize.multi;
          // otherwise we nuke whatever is there and move on
        } else {
          selection.type = selectionInfo.type;
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
        // this was most likely the reason we made the selection in the first place,
        // and now we're done with it.
        diffs.push.apply(diffs, dispatch("clearSelection", {}, true));
        break;
      case "removeCell":
        var {cellId} = info;
        diffs = removeCell(cellId);
        diffs.push.apply(diffs, removeCellFacts(cellId));
        break;
      case "moveCellCursor":
        var activeCellId = localState.notebook.activeCellId;
        var orderedCells = orderedRelatedCells(localState.notebook.containerCell);
        if(!orderedCells.length) {
          break;
        } else if(activeCellId === 0 && info.dir === -1) {
          activeCellId = orderedCells[0]["related notebook cell order: cell2"];
        } else {
          let prevId = 0;
          let ix = 0;
          for(let cell of orderedCells) {
            let cellId = cell["related notebook cell order: cell2"];
            if(cellId === activeCellId) {
              if(info.dir === 1) {
                activeCellId = prevId;
                break;
              } else {
                let next = orderedCells[ix+1];
                let nextId = next ? next["related notebook cell order: cell2"] : activeCellId;
                activeCellId = nextId;
                break;
              }
            }
            ix++;
            prevId = cellId;
          }
        }
        diffs = dispatch("setActiveCell", {cellId: activeCellId});
        break;
      case "addResultChart":
        var ix = relatedCellNextIndex(info.cellId);
        var {diffs, cellId} = createChartCell(ui.ChartType.BAR, info.cellId, ix, info.viewId);
        break;
      case "setChartType":
        var {cellId, type} = info;
        var elementId = ixer.selectOne("notebook cell uiElement", {cell: cellId})["notebook cell uiElement: element"];
        diffs.push(api.remove("uiAttribute", {element: elementId, property: "chartType"}));
        diffs.push(api.insert("uiAttribute", {element: elementId, property: "chartType", value: type}));
        break;
      case "bindAttribute":
        var {selection, elementId, property} = info;
        if(selection.type === SelectionType.field) {
          let fieldId = selection.items[0].fieldId;
          diffs.push(api.remove("uiAttributeBinding", {element: elementId, property}));
          diffs.push(api.insert("uiAttributeBinding", {element: elementId, property, field: fieldId}));
        }
        break;
      case "addUnionActionCell":
        var ix = relatedCellNextIndex(info.cellId);
        var {diffs, cellId} = createCell(info.cellId, "union", ix, info.viewId);
        break;
      case "submitUnionCell":
        var activeCellId = info.cellId;
        if(activeCellId && info.value === "") {
          return dispatch("removeCell", {cellId: activeCellId});
        }
        var unionId;
        // @TODO: we currently only allow one mapping in here and we're discarding
        // anything else that's added. This is probably the right thing to do, but
        // we need some affordance in the UI for it.
        var item = parseMadlibsFromString(info.value)[0];
        // if it's a create, then create the madlib
        if(item.type === "create") {
          let created = madlibUnionFromString(item.madlib);
          diffs.push.apply(diffs, created.diffs);
          unionId = created.viewId;
        }
        // otherwise the item's view is the union we'll be pusing into
        else if(item.type === "query") {
          unionId = item.viewId;
        }
        var parentCellId = ixer.selectOne("related notebook cell", {cell2: activeCellId})["related notebook cell: cell"];
        var parentCellViewId = ixer.selectOne("notebook cell view", {cell: parentCellId})["notebook cell view: view"];
        // if we had a view already mapped to this cell, then we may need to rebind
        // everything to a new union.
        var originalView = ixer.selectOne("notebook cell view", {cell: activeCellId});
        if(originalView) {
          let originalViewId = originalView["notebook cell view: view"];
          if(originalViewId !== unionId) {
            diffs.push(api.remove("notebook cell view", {cell: activeCellId}));
            diffs.push(api.insert("notebook cell view", {cell: activeCellId, view: unionId}));
            let memberId = uuid();
            // @TODO: get the next memberIx;
            let memberIx = nextMemberIx(unionId);
          console.log("memberIx", memberIx);
            diffs.push(api.insert("member", {view: unionId, ix: memberIx, member: memberId, "member view": parentCellViewId}));
            // clean up the old member / mappings
            let originalMemberId = ixer.selectOne("member", {view: parentCellViewId, "member view": originalViewId})["member: member"];
            diffs.push(api.remove("member", {member: originalMemberId}));
            diffs.push(api.remove("mapping", {member: originalMemberId}));
          }
        }
        // otherwise point our cell to the union
        else {
          diffs.push(api.insert("notebook cell view", {cell: activeCellId, view: unionId}));
          // add a member to the parentCellView
          let memberId = uuid();
          // @TODO: get the next memberIx;
          let memberIx = nextMemberIx(unionId);
          console.log("memberIx", memberIx);
          diffs.push(api.insert("member", {view: unionId, ix: memberIx, member: memberId, "member view": parentCellViewId}));
        }

        localState.input.value = "";
        // we're now done with whatever cell was active
        localState.notebook.activeCellId = 0;
        break;
      case "addUnionMapping":
        diffs.push(api.remove("mapping", {member: info.memberId, "view field": info.unionFieldId}));
        diffs.push(api.insert("mapping", {member: info.memberId, "member field": info.memberFieldId, "view field": info.unionFieldId}));
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

  function nextMemberIx(unionId) {
    let ix = 0;
    for(let member of ixer.select("member", {view: unionId})) {
        ix = Math.max(member["member: ix"], ix);
    };
    return ix + 1;
  }

  function orderedRelatedCells(parentCellId) {
    let cellOrders = ixer.select("related notebook cell order", {cell: parentCellId});
    cellOrders.sort((a, b) => {
      return b["related notebook cell order: ix"] - a["related notebook cell order: ix"];
    });
    return cellOrders;
  }

  function removeCellFacts(cellId) {
    let diffs = [];
    // remove any fact rows related to this cell
    diffs.push(api.remove("cell fact row", {cell: cellId}));
    for(let factRow of ixer.select("cell fact row", {cell: cellId})) {
      let viewId = factRow["cell fact row: source view"];
      let row = JSON.parse(factRow["cell fact row: row"]);
      let {tableId, mapped} = mapUnionFieldsToTable(viewId, row);
      diffs.push(api.remove(tableId, mapped, null, true));
    }
    return diffs;
  }

  function removeCell(cellId) {
    let diffs = [];
    let cellKind = ixer.selectOne("notebook cell", {cell: cellId})["notebook cell: kind"];
    diffs.push(api.remove("notebook cell", {cell: cellId}));
    diffs.push(api.remove("related notebook cell", {cell: cellId}));
    diffs.push(api.remove("related notebook cell", {cell2: cellId}));
    // @TODO: should we really always remove the dependents? this means every
    // related cell will be deleted and could cause scary cascading deletes.
    // remove depedents
    for(let related of ixer.select("related notebook cell", {cell: cellId})) {
      let cell2 = related["related notebook cell: cell2"];
      diffs.push.apply(diffs, removeCell(cell2));
    }
    diffs.push(api.remove("related notebook cell order", {cell: cellId}));
    diffs.push(api.remove("related notebook cell order", {cell2: cellId}));
    if(cellKind === "query") {
      diffs.push(api.remove("notebook cell view", {cell: cellId}));
      for(let cellView of ixer.select("notebook cell view", {cell: cellId})) {
        let viewId = cellView["notebook cell view: view"];
        diffs.push.apply(diffs, drawn.removeView(viewId));
      }
    } else if(cellKind === "chart") {
      let elementId = ixer.selectOne("notebook cell uiElement", {cell: cellId})["notebook cell uiElement: element"];
      diffs.push(api.remove("notebook cell uiElement", {cell: cellId}));
      diffs.push(api.remove("uiElement", {element: elementId}));
      diffs.push(api.remove("uiElementBinding", {element: elementId}));
      diffs.push(api.remove("uiAttribute", {element: elementId}));
    } else if(cellKind === "union") {
      let cellView = ixer.selectOne("notebook cell view", {cell: cellId});
      if(cellView) {
        let parentCellId = ixer.selectOne("related notebook cell", {cell2: cellId})["related notebook cell: cell"];
        let parentCellViewId = ixer.selectOne("notebook cell view", {cell: parentCellId})["notebook cell view: view"];
        let unionId = cellView["notebook cell view: view"];
        let memberId = ixer.selectOne("member", {view: unionId, "member view": parentCellViewId})["member: member"];
        diffs.push(api.remove("member", {member: memberId}));
        diffs.push(api.remove("mapping", {member: memberId}));
      }
    }
    return diffs;
  }

  function createCell(parent, cellType, ix, viewId?) {
    let diffs = [];
    let cellId = uuid();
    diffs.push(api.insert("notebook cell", {cell: cellId, kind: cellType}));
    diffs.push(api.insert("related notebook cell", {cell: parent, cell2: cellId}));
    diffs.push(api.insert("related notebook cell order", {cell: parent, cell2: cellId, ix}));
    if(viewId) {
      diffs.push(api.insert("notebook cell view", {cell: cellId, view: viewId}));
    }
    return {diffs, cellId};
  }

  function createChartCell(chartType, parentCellId, ix, viewId) {
    let {diffs, cellId} = createCell(parentCellId, "chart", ix);
    //we have to create a chart Element
    let elementId = uuid();
    let parentElementId = uuid();
    diffs.push(api.insert("notebook cell uiElement", {cell: cellId, element: elementId}));
    diffs.push(api.insert("uiElement", {element: elementId, parent: parentElementId, tag: "chart"}));
    diffs.push(api.insert("uiElementBinding", {element: elementId, view: viewId}));
    diffs.push(api.insert("uiAttribute", {element: elementId, property: "chartType", value: chartType}));
    return {diffs, cellId};
  }

  function relatedCellNextIndex(parentCellId) {
    let cellOrders = orderedRelatedCells(parentCellId);
    let index = 0;
    if(cellOrders[0]) {
      index = cellOrders[0]["related notebook cell order: ix"] + 1;
    }
    return index;
  }

  function cellToString(cellId) {
    let final = "";
    let facts = ixer.select("cell fact row", {cell: cellId});
    facts.sort((a, b) => {
      let aIx = a["cell fact row: ix"];
      let bIx = b["cell fact row: ix"];
      return aIx - bIx;
    });
    for(let fact of facts) {
      let viewId = fact["cell fact row: source view"];
      let row = JSON.parse(fact["cell fact row: row"]);
      let madlibText = ixer.selectOne("madlib", {view: viewId})["madlib: madlib"];
      let madlibParts = madlibText.split(/(\?)/);
      let fields = ixer.getFields(viewId);
      let fieldIx = 0;
      for(let part of madlibParts) {
        if(part === "?") {
          final += row[fields[fieldIx]];
          fieldIx++;
        } else {
          final += part;
        }
      }
      final += "\n";
    }
    let view = ixer.selectOne("notebook cell view", {cell: cellId});
    if(view) {
      let viewId = view["notebook cell view: view"];
      let joinInfo = getJoinInfo(viewId);
      let sources = ixer.select("source", {view: viewId});
      sources.sort((a, b) => {
        let aId = a["source: source"];
        let bId = b["source: source"];
        let aIx = ixer.selectOne("source madlib index", {source: aId})["source madlib index: ix"];
        let bIx = ixer.selectOne("source madlib index", {source: bId})["source madlib index: ix"];
        return aIx - bIx;
      });
      for(let source of sources) {
        let sourceId = source["source: source"];
        let sourceViewId = source["source: source view"];
        let sourceInfo = joinInfo[sourceId];
        let madlibText = ixer.selectOne("madlib", {view: sourceViewId})["madlib: madlib"];
        let madlibParts = madlibText.split(/(\?)/);
        let fields = ixer.getFields(sourceViewId);
        let fieldIx = 0;
        if(sourceInfo.negated) {
          final += "! ";
        }
        for(let part of madlibParts) {
          let fieldId = fields[fieldIx];
          let fieldInfo = sourceInfo.fields[fieldId];
          if(part === "?") {
            if(fieldInfo.filtered) {
              final += fieldInfo.constantValue;
            } else {
              final += part;
            }
            if(fieldInfo.column) {
              final += "?";
            }
            if(fieldInfo.color) {
              final += `${fieldInfo.color}`;
            }
            fieldIx++;
          } else {
            final += part;
          }
        }
        final += "\n";
      }
    }
    return final.trim();
  }

  function itemFieldMapping(originalViewId, items) {
    let joinInfo = getJoinInfo(originalViewId);
    let mapping = {};
    let seenSourceViews = {};
    let duplicatedSourceViews = [];
    for(let sourceId in joinInfo) {
      let sourceInfo = joinInfo[sourceId];
      let sourceViewId = sourceInfo.viewId;
      if(seenSourceViews[sourceViewId]) {
        duplicatedSourceViews.push(sourceViewId);
      }
      seenSourceViews[sourceViewId] = true;
    }
    //if there are multiple sources with the same sourceView we have
    //to do something more complicated.
    if(duplicatedSourceViews.length) {
      // @TODO: figure out how we deal with mapping in this case
    }
    //Otherwise, we can map things from oldVars[sourceView.field] to
    //newVars[sourceView.field]
    else {
      let newFields = {};
      for(let item of items) {
        let viewId = item.viewId;
        for(let fieldId in item.fields) {
          let field = item.fields[fieldId];
          let selectFieldId = field.fieldId;
          newFields[`${viewId}.${fieldId}`] = selectFieldId;
        }
      }
      for(let sourceId in joinInfo) {
        let sourceInfo = joinInfo[sourceId];
        let sourceViewId = sourceInfo.viewId;
        for(let fieldId in sourceInfo.fields) {
          let field = sourceInfo.fields[fieldId];
          let selectFieldId = field.fieldId;
          mapping[selectFieldId] = newFields[`${sourceViewId}.${fieldId}`];
        }
      }
    }
    return mapping;
  }

  function remapRelatedCell(relatedCell, newViewId, fieldMapping) {
    let diffs = [];
    let cellId = relatedCell["related notebook cell: cell"];
    let relatedCellId = relatedCell["related notebook cell: cell2"];
    let relatedKind = ixer.selectOne("notebook cell", {cell: relatedCellId})["notebook cell: kind"];
    if(relatedKind === "chart") {
      let elementId = ixer.selectOne("notebook cell uiElement", {cell: relatedCellId})["notebook cell uiElement: element"];
      // update uiElement binding
      diffs.push(api.remove("uiElementBinding", {element: elementId}));
      diffs.push(api.insert("uiElementBinding", {element: elementId, view: newViewId}));
      // update bindings
      diffs.push(api.remove("uiAttributeBinding", {element: elementId}));
      for(let attrBinding of ixer.select("uiAttributeBinding", {element: elementId})) {
        let newFieldId = fieldMapping[attrBinding["uiAttributeBinding: field"]];
        // if there's a field mapping for this binding, rebind it to the new field
        if(newFieldId) {
          let property = attrBinding["uiAttributeBinding: property"];
          diffs.push(api.insert("uiAttributeBinding", {element: elementId, property, field: newFieldId}));
        }
      }
    }
    return diffs;
  }

  var madlibToPartsCache = {};
  function splitMadlibIntoParts(str) {
    let cached = madlibToPartsCache[str];
    if(cached) return cached;
    let split = str.split(/(\?)/);
    madlibToPartsCache[str] = split;
    return split;
  }

  function madlibUnionFromString(str) {
    let diffs = [];
    let fields = [];
    let parts = splitMadlibIntoParts(str);
    let viewId = uuid();
    diffs.push(api.insert("madlib", {view: viewId, madlib: str}));
    diffs.push(api.insert("view", {view: viewId, kind: "union"}));
    // we also need to create a view for manual additions to the union
    let tableId = uuid();
    let tableMemberId = uuid();
    diffs.push(api.insert("view", {view: tableId, kind: "table"}));
    diffs.push(api.insert("member", {view: viewId, ix: 0, member: tableMemberId, "member view": tableId}));
    diffs.push(api.insert("madlib union to table", {union: viewId, table: tableId}));
    parts.forEach((part, ix) => {
      let cleanedPart = part.trim();
      if(part === "?") {
        // add a field to the union
        let fieldId = uuid();
        diffs.push(api.insert("field", {field: fieldId, view: viewId, kind: "output", dependents: {
          "display name": {name: "blank"},
          "display order": {priority: ix},
        }}));
        fields.push(fieldId);
        // we have to create fields for the manual table too
        let tableFieldId = uuid();
        diffs.push(api.insert("field", {field: tableFieldId, view: tableId, kind: "output", dependents: {
          "display name": {name: "blank"},
          "display order": {priority: ix},
        }}));
        diffs.push(api.insert("mapping", {"view field": fieldId, member: tableMemberId, "member field": tableFieldId}));
      }
    });
    return {diffs, viewId, fields};
  }

  function mapUnionFieldsToTable(unionId, fields) {
    let tableId = ixer.selectOne("madlib union to table", {union: unionId})["madlib union to table: table"];
    let tableMemberId = ixer.selectOne("member", {view: unionId, "member view": tableId})["member: member"];
    let mapped = {};
    for(let fieldId in fields) {
      let mappedFieldId = ixer.selectOne("mapping", {"view field": fieldId, member: tableMemberId})["mapping: member field"];
      mapped[mappedFieldId] = fields[fieldId];
    }
    return {tableId, mapped};
  }

  function parseMadlibBlanks(blanks, fieldIds = []) {
    // by default we have an add
    let chunked = false;
    let type = "add";
    let fields = {};
    let values = {};
    var ix = 0;
    for(let blank of blanks) {
      let fieldId = fieldIds[ix] || ix;
      let cleanedBlank = blank.trim();
      let fieldInfo:any = {};
      // if we find a blank then we're dealing with a query
      if(cleanedBlank[0] === "?" && cleanedBlank.length > 1) {
        type = "query";
        let variable = cleanedBlank.substring(1);
        if(cleanedBlank[1] === "?") {
          // we are chunked
          chunked = true;
          variable = variable.substring(1);
          fieldInfo.column = true;
        }
        if(variable) {
          fieldInfo.variable = variable;
        }
      } else if (cleanedBlank === "?" || cleanedBlank === "blank") {
        type = "query";
        fieldInfo.scalar = true;
      } else {
        // store the values of each field in case we need them for adding filters
        // or for an add.
        fieldInfo.constantValue = cleanedBlank;
        fieldInfo.filtered = true;
        values[fieldId] = drawn.coerceInput(cleanedBlank);
      }
      fields[fieldId] = fieldInfo;
      ix++;
    }
    return {chunked, fields, type, values};
  }

  let madlibRegexCache = {};
  export function parseMadlibsFromString(str) {
    let madlibs = ixer.select("madlib", {});
    let results = [];
    //break the string into lines
    let lines = str.trim().toLowerCase().split("\n");
    let lineNum = -1;
    for(let line of lines) {
      lineNum++;
      let found = false;
      let negated = false;
      let chunked = false;

      let cleanedLine = line.trim();
      if(cleanedLine[0] === "!") {
        negated = true;
        cleanedLine = cleanedLine.substring(1).trim();
      }

      // go through each madlib it could possibly be
      // @TODO: if this ends up being slow, we could probably use a trie here
      for(let madlib of madlibs) {
        let madlibView = madlib["madlib: view"];
        let madlibRegex = madlibRegexCache[madlibView];
        if(!madlibRegex) {
          let madlibText = madlib["madlib: madlib"].replace(/([\*\+\(\)\[\]])/, "\\$1");
          let regexStr = madlibText.replace(/\?/gi, "(.+)");
          madlibRegex = madlibRegexCache[madlibView] = new RegExp(regexStr);
        }
        // check if this line matches the madlib's regex
        var matches = cleanedLine.match(madlibRegex);
        if(matches) {
          // by default we have an add
          let fields = ixer.getFields(madlibView);
          matches.shift();
          let result:any = parseMadlibBlanks(matches, fields);
          result.viewId = madlibView;
          result.ix = lineNum;
          result.negated = negated;
          results.push(result);
          found = true;
          break;
        }
      }
      if(!found) {
        // if we get here, it means we didn't find a match. So we need to add a create for this line.
        cleanedLine = cleanedLine.replace(/blank/gi, "?");
        let matches = cleanedLine.match(/(\?[^\s]*)/gi);
        let result:any = parseMadlibBlanks(matches);
        result.type = "create";
        result.madlib = cleanedLine.replace(/(\?[^\s]*)/gi, "?");
        result.ix = lineNum;
        result.negated = negated;
        results.push(result);
      }
    }
    return results;
  }

  export function addSourceFieldVariable(itemId, sourceViewId, sourceId, fieldId, fieldInfo, sourceItemInfo) {
    let diffs = [];
    let kind;
    // check if we're adding an ordinal
    if(fieldId === "ordinal") {
      kind = "ordinal";
    } else {
      let field = ixer.selectOne("field", {field: fieldId});
      kind = field ? field["field: kind"] : "output";
    }
    // add a variable
    let variableId = uuid();
    diffs.push(api.insert("variable", {view: itemId, variable: variableId}));
    if(kind === "ordinal") {
      // create an ordinal binding
      diffs.push(api.insert("ordinal binding", {variable: variableId, source: sourceId}));
    } else {
      // bind the field to it
      diffs.push(api.insert("binding", {variable: variableId, source: sourceId, field: fieldId}));
    }
    // select the field
    let selectFieldId = uuid();
    diffs.push(api.insert("field", {field: selectFieldId, view: itemId, kind: "output", dependents: {
      "display name": {name: code.name(fieldId) || fieldId},
      "display order": {priority: fieldInfo.fieldIx},
    }}));
    diffs.push(api.insert("select", {field: selectFieldId, variable: variableId}));
    fieldInfo.fieldId = selectFieldId;

    if(kind !== "output" && kind !== "ordinal" && fieldInfo.constantValue === undefined) {
      // otherwise we're an input field and we need to add a default constant value
      diffs.push(api.insert("constant binding", {variable: variableId, value: api.newPrimitiveDefaults[sourceViewId][fieldId]}));

    } else if(fieldInfo.constantValue !== undefined) {
      diffs.push(api.insert("constant binding", {variable: variableId, value: fieldInfo.constantValue}));
    }

    // if the source is chunked, and we're not a column, we need to group
    if(sourceItemInfo.chunked && !fieldInfo.column) {
      diffs.push(api.insert("grouped field", {source: sourceId, field: fieldId}));
    } else if(sourceItemInfo.chunked) {
      // we to make sure that sorting is set
      // @TODO: how do we expose sort order here?
      diffs.push(api.insert("sorted field", {source: sourceId, field: fieldId, ix: fieldInfo.sortIx, direction: "ascending"}))
    }

    return {diffs, variableId, selectFieldId};
  }

  function madlibParseItemsToDiffs(cellId, queryId, items) {
    let queryVariables = {};
    let diffs = [];
    for(var item of items) {
      if(item.type === "add") {
        let {tableId, mapped} = mapUnionFieldsToTable(item.viewId, item.values);
        diffs.push(api.insert("cell fact row", {cell: cellId, "source view": item.viewId, row: JSON.stringify(item.values), ix: item.ix}));
        diffs.push(api.insert(tableId, mapped, undefined, true));
      } else {
        var viewId = item.viewId;
        var fields;
        // this means we're querying and may or may not need to create a madlib
        if(item.type === "create") {
          // create a madlib for this guy
          let created = madlibUnionFromString(item.madlib);
          diffs.push.apply(diffs, created.diffs);
          viewId = created.viewId;
          fields = created.fields;
          // now that we have fieldIds map the previously indexed field
          // information to those ids.
          for(let ix = 0; ix < fields.length; ix++) {
            let fieldId = fields[ix];
            item.fields[fieldId] = item.fields[ix];
          }
        } else {
          fields = ixer.getFields(viewId);
        }
        //add this as a source
        var sourceId = uuid();
        diffs.push(api.insert("source", {view: queryId, source: sourceId, "source view": viewId}));
        diffs.push(api.insert("source madlib index", {source: sourceId, ix: item.ix}));
        // check if this source is chunked
        if(item.chunked) {
          diffs.push(api.insert("chunked source", {source: sourceId}));
        }
        // check if this source is negated
        if(item.negated) {
          diffs.push(api.insert("negated source", {source: sourceId}));
        }
        // add variables for all the fields of this view
        var sortIx = 0;
        var fieldIx = 0;
        fields.forEach(function(fieldId, ix) {
          let fieldInfo = item.fields[fieldId];
          fieldInfo.fieldIx = fieldIx;
          fieldIx++;
          if(fieldInfo.column) {
            fieldInfo.sortIx = sortIx;
            sortIx++;
          }
          let namedVariable = fieldInfo.variable;
          let variableId;
          if(namedVariable && queryVariables[namedVariable]) {
            let variableInfo = queryVariables[namedVariable];
            // if we already have a variable for this one, then we only need a binding
            // from this field to the already created variable
            diffs.push(api.insert("binding", {variable: variableInfo.variableId, source: sourceId, field: fieldId}));
            fieldInfo.variableId = variableInfo.variableId;
            fieldInfo.fieldId = variableInfo.selectFieldId;
          } else {
            // we need to create a variable for this field
            let variableInfo = addSourceFieldVariable(queryId, viewId, sourceId, fieldId, fieldInfo, item);
            variableId = variableInfo.variableId;
            fieldInfo.variableId = variableId;
            diffs.push.apply(diffs, variableInfo.diffs);
            if(namedVariable) {
              queryVariables[namedVariable] = variableInfo;
            }
          }
        });
      }
    }
    return diffs;
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

  function CodeMirrorElement(node, elem) {
    let cm = node.editor;
    if(!cm) {
      cm = node.editor = new CodeMirror(node);
      if(elem.onInput) {
        cm.on("change", elem.onInput)
      }
      if(elem.keydown) {
        cm.on("keydown", elem.keydown);
      }
      cm.focus();
    }
    if(cm.getValue() !== elem.value) {
      cm.setValue(elem.value);
    }
  }

  function chatInput(cellId, onSubmit = submitQuery) {
    let numLines = localState.input.value.split("\n").length;
    let height = Math.max(21, numLines * 21);
    let submitActionText = "add";
    let value = "";
    if(cellId && localState.notebook.activeCellId === cellId) {
      value = localState.input.value;
      if(localState.input.value) {
        submitActionText = "edit"
      } else {
        submitActionText = "remove";
      }
    }
    return {id: `chat-input ${cellId}`, c: "chat-input-container", children: [
      {c: "chat-input", onSubmit, cellId, postRender:CodeMirrorElement, keydown: chatInputKey, onInput: trackChatInput, placeholder: "Enter a message...", value},
      {c: "submit", cellId, mousedown: onSubmit, text: submitActionText},
    ]}
  }

  function trackChatInput(cm, changes) {
    dispatch("trackChatInput", {value: cm.getValue()});
  }

  function submitQuery(e, elem) {
    dispatch("submitQuery", {value: localState.input.value, cellId: elem.cellId});
  }

  function chatInputKey(e, elem) {
    if(e.keyCode === api.KEYS.ENTER && (e.metaKey || e.ctrlKey)) {
      elem.onSubmit(e, elem);
      e.preventDefault();
    } else if(e.keyCode === api.KEYS.UP && e.ctrlKey) {
      dispatch("moveCellCursor", {dir: -1});
      e.preventDefault();
    } else if(e.keyCode === api.KEYS.DOWN && e.ctrlKey) {
      dispatch("moveCellCursor", {dir: 1});
      e.preventDefault();
    }
  }

  function workspaceTools() {
    let actions = {
      "join": {func: joinBlanks, text: "Link", description: "Link the blanks", semantic: "action::join"},
    };
    let disabled = {};
    return drawn.leftToolbar(actions, disabled);
  }

  function joinBlanks(e, elem) {
    dispatch("joinBlanks", {blanks: localState.selection.items});
  }

  function workspaceCanvas() {
    let activeCellId = localState.notebook.activeCellId;
    let cellItems = []
    let parentCell = localState.notebook.containerCell;
    let cells = ixer.select("related notebook cell", {cell: localState.notebook.containerCell});
    cells.sort((a, b) => {
      let aOrder = ixer.selectOne("related notebook cell order", {cell: parentCell, cell2: a["related notebook cell: cell2"]});
      let bOrder = ixer.selectOne("related notebook cell order", {cell: parentCell, cell2: b["related notebook cell: cell2"]});
      return aOrder["related notebook cell order: ix"] - bOrder["related notebook cell order: ix"];
    });
    for(let related of cells) {
      let cellId = related["related notebook cell: cell2"];
      let cell = ixer.selectOne("notebook cell", {cell: cellId});
      let kind = cell["notebook cell: kind"];
      let item;
      if(kind === "query") {
        let viewId = ixer.selectOne("notebook cell view", {cell: cellId})["notebook cell view: view"];
        item = joinItem(viewId, cellId);
      }
      if(cellId === activeCellId) {
        item.c += " active";
      }
      item.cellId = cellId;
      cellItems.push(item);
    }
    cellItems.push({c: "item", children: [
      {c: "message-container user-message", children: [
        {c: "message", children: [chatInput(0)]},
        {c: "sender", text: "Me"},
      ]},
    ]});
    return {c: "canvas", key: localState.input.messageNumber, postRender: scrollToBottom, mousedown: maybeClearSelection, children: cellItems};
  }

  function scrollToBottom(node, elem) {
    if(node.lastMessageNumber !== localState.input.messageNumber) {
      node.scrollTop = 2147483647; // 2^31 - 1, because Number.MAX_VALUE and Number.MAX_SAFE_INTEGER are too large and do nothing in FF...
      node.lastMessageNumber = localState.input.messageNumber;
    }
  }

  function maybeClearSelection(e, elem) {
    if(!e.target.classList.contains("value") && !e.shiftKey) {
      dispatch("clearSelection", {});
    }
    if(e.target.classList.contains("canvas")) {
      dispatch("setActiveCell", {cellId: 0});
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

  function joinItem(viewId, cellId) {
    let results = ixer.select(viewId, {});
    let joinInfo = getJoinInfo(viewId);
    let sourceItems = [];
    let filledSources = [];
    let sources = ixer.select("source", {view: viewId});
    let factRows = ixer.select("cell fact row", {cell: cellId});
    factRows.sort((a, b) => {
      let aIx = a["cell fact row: ix"];
      let bIx = b["cell fact row: ix"];
      return aIx - bIx;
    });
    for(let fact of factRows) {
      let sourceView = fact["cell fact row: source view"];
      let row = JSON.parse(fact["cell fact row: row"]);
      sourceItems.push(madlibForView(sourceView, {
        rows: [row],
        selectable: false
      }));
    }

    sources.sort((a, b) => {
      let aId = a["source: source"];
      let bId = b["source: source"];
      let aIx = ixer.selectOne("source madlib index", {source: aId})["source madlib index: ix"];
      let bIx = ixer.selectOne("source madlib index", {source: bId})["source madlib index: ix"];
      return aIx - bIx;
    });
    for(let source of sources) {
      let sourceId = source["source: source"];
      let sourceView = source["source: source view"];
      let sourceRow = extractSourceValuesFromResultRow(results[0], sourceId);
      sourceItems.push(madlibForView(sourceView, {
        rows: [],
        joinInfo: joinInfo[sourceId].fields,
        selectable: true,
        toSelection: blankSelection,
        onDrop: dropJoin,
        sourceId,
      }));
      filledSources.push(madlibForView(sourceView, {
        rows: [sourceRow],
        joinInfo: joinInfo[sourceId].fields,
        selectable: true,
        toSelection: fieldSelection,
        onSelect: selectBlank,
        sourceId,
      }));
    }

    if(cellId === localState.notebook.activeCellId) {
      sourceItems = [chatInput(cellId)];
    }
    let result = queryResult(results, factRows, filledSources, cellId, viewId);
    return {id: `cell-${cellId}`, c: "item", children: [
      {c: "button remove ion-trash-b", cellId, click: removeCellItem},
      {c: "message-container user-message", dblclick: setActiveCell, cellId, children: [
        {c: "message", children: sourceItems},
        {c: "sender", text: "Me"},
      ]},
      result,
    ]};
  }

  function queryResult(results, factRows, filledSources, cellId, viewId) {
    // if there aren't any sources, this is just a fact block.
    if(!filledSources.length) {
      return {c: "message-container eve-response", children: [
        {c: "message", children: [
          {c: "message-text", text: `${factRows.length} facts added`},
        ]},
        {c: "sender", text: "Eve"},
      ]};
    }
    let message = `1 of ${results.length} matches`;
    let resultMadlibs = {c: "results", children: filledSources};
    if(results.length === 0) {
      message = "0 matches";
//       resultMadlibs = undefined;
    } else if (results.length === 1) {
      message = `1 match`;
    }
    let related;
    let relatedCells = ixer.select("related notebook cell", {cell: cellId});
    if(relatedCells.length) {
      let children = [];
      for(let related of relatedCells) {
        let relatedId = related["related notebook cell: cell2"];
        let cell = ixer.selectOne("notebook cell", {cell: relatedId});
        let kind = cell["notebook cell: kind"];
        if(kind === "chart") {
          children.push(drawChartCell(relatedId))
        } else if(kind === "union") {
          children.push(drawUnionCell(relatedId, cellId, viewId));
        }
      }
      related = {children};
    }
    return {c: "message-container eve-response", children: [
        {c: "message", children: [
          resultMadlibs,
          related,
          {c: "button ion-pie-graph", click: addResultChart, viewId, cellId},
          {c: "button", text: "new madlib", click: addUnionActionCell, viewId, cellId},
          {c: "message-text", text: message},
        ]},
        {c: "sender", text: "Eve"},
      ]};
  }

  function addUnionActionCell(e, elem) {
    dispatch("addUnionActionCell", {view: elem.viewId, cellId: elem.cellId});
  }

  function submitUnionCell(e, elem) {
    dispatch("submitUnionCell", {value: localState.input.value, cellId: elem.cellId});
  }

  function drawUnionCell(cellId, parentCellId, parentViewId): microReact.Element {
    if(localState.notebook.activeCellId === cellId) {
      return {c: "cell union", children:[
        chatInput(cellId, submitUnionCell),
      ]}
    }
    let cellViewId;
    let memberId;
    let cellView = ixer.selectOne("notebook cell view", {cell: cellId});
    if(cellView) {
      cellViewId = cellView["notebook cell view: view"];
      memberId = ixer.selectOne("member", {view: cellViewId, "member view": parentViewId})["member: member"];
    }

    return {c: "cell union", cellId, unionId: cellViewId, dblclick: setActiveUnionCell, children:[
      {text: "For each result add:"},
      madlibForView(cellViewId, {
        rows: [],
        onDrop: addUnionMapping,
//         joinInfo: joinInfo[sourceId].fields,
//         selectable: true,
        toSelection: unionFieldSelection,
//         sourceId,
        memberId,
      })
    ]};
  }

  function unionFieldSelection(fieldId, fieldInfo, opts) {
    return {
      type: SelectionType.field,
      fieldId,
    };
  }

  function setActiveUnionCell(e, elem) {
    dispatch("setActiveUnionCell", {unionId: elem.unionId, cellId: elem.cellId});
  }

  function addUnionMapping(e, elem) {
    if(localState.selection.type === SelectionType.field) {
      let memberFieldId = localState.selection.items[0].fieldId;
      let unionFieldId = elem.selectionInfo.fieldId;
      dispatch("addUnionMapping", {memberId: elem.opts.memberId, unionFieldId, memberFieldId})
    }
  }

  function addResultChart(e, elem) {
    dispatch("addResultChart", {viewId: elem.viewId, cellId: elem.cellId});
  }

  function bindAttribute(e, elem) {
    dispatch("bindAttribute", {selection: localState.selection, elementId: elem.elementId, property: elem.property});
  }

  function uiAttributeBindingBlank(label, elementId, property) {
    return {c: "attribute-blank", children: [
      {elementId, property, dragover: (e) => {e.preventDefault();}, drop: bindAttribute, text: label},
    ]};
  }

  function drawChartCell(cellId) {
    var uiElementId = ixer.selectOne("notebook cell uiElement", {cell: cellId})["notebook cell uiElement: element"];
    var parentElement = ixer.selectOne("uiElement", {element: uiElementId})["uiElement: parent"];
    //based on the type of chart we need different binding controls
    let leftControls = [];
    let bottomControls = [];
    let type = ixer.selectOne("uiAttribute", {element: uiElementId, property: "chartType"})["uiAttribute: value"];
    if(type === ui.ChartType.LINE || type === ui.ChartType.BAR || type === ui.ChartType.SCATTER || type === ui.ChartType.AREA) {
      //xs, ys, labels
      leftControls.push(uiAttributeBindingBlank("y", uiElementId, "ydata"));
      bottomControls.push(uiAttributeBindingBlank("x", uiElementId, "xdata"));
      bottomControls.push(uiAttributeBindingBlank("labels", uiElementId, "pointLabels"));
    } else if(type === ui.ChartType.PIE) {
      //ys, labels
      leftControls.push(uiAttributeBindingBlank("x", uiElementId, "xdata"));
      leftControls.push(uiAttributeBindingBlank("labels", uiElementId, "pointLabels"));
    } else if(type === ui.ChartType.GAUGE) {
      //value
      bottomControls.push(uiAttributeBindingBlank("value", uiElementId, "ydata"));
    }
    // @TODO: we're generating all the charts, which is unnecessary
    var charts = drawn.renderer.compile([uiElementId])[0];
    if(!charts.children.length) return;
    // @TODO: for now we're only ever showing the first result, but once we can scroll
    // through them, this will no longer be just the first.
    var curChart = charts.children[0];
    curChart.parent = undefined;
    return {c: "cell chart", children:[
      ui.dropdown({cellId, defaultOption: ui.ChartType[type].toLowerCase(), options: ["bar", "line", "area", "scatter", "pie", "gauge"], change: selectChartType}),
      {c: "left-controls", children: leftControls},
      {c: "column", children: [
        {c: "chart-container", children: [curChart]},
        {c: "bottom-controls", children: bottomControls},
      ]},
    ]}
  }

  function selectChartType(e, elem) {
    let type = ui.ChartType[e.currentTarget.value.toUpperCase()];
    if(type !== undefined) {
      dispatch("setChartType", {cellId: elem.cellId, type});
    }
  }

  function removeCellItem(e, elem) {
    dispatch("removeCell", {cellId: elem.cellId});
  }

  function blankSelection(fieldId, fieldInfo, opts) {
    return {
      type: SelectionType.blank,
      fieldId,
      sourceId: opts.sourceId
    };
  }
  function fieldSelection(fieldId, fieldInfo, opts) {
    return {
      type: SelectionType.field,
      fieldId: fieldInfo.fieldId,
    };
  }

  function selectBlank(e, elem) {
    if(elem.selectionInfo) {
      dispatch("extendSelection", {selectionInfo: elem.selectionInfo}, true);
    }
    //e.preventDefault();
  }

  function startDrag(e, elem) {
    e.dataTransfer.setData("text", "foo");
  }

  function madlibRow(viewId, madlibParts, row, opts) {
    let {joinInfo = {}, editable = false, focus = false, selectable = false} = opts;
    let focused = false;
    let items = [];
    let ix = 0;
    let fields = ixer.getFields(viewId);
    for(let part of madlibParts) {
      if(part !== "?") {
        items.push({t: "td", c: "madlib-blank", children: [
          {c: "madlib-text", text: part}
        ]});
      } else {
        let fieldId = fields[ix];
        let fieldInfo = joinInfo[fieldId];
        let selectionInfo;
        if(opts.toSelection) {
          selectionInfo = opts.toSelection(fieldId, fieldInfo, opts)
        }
        let value = row[fieldId] !== undefined ? row[fieldId] : "?";
        let field:any = {c: "value", draggable:true, dragover: (e) => { e.preventDefault(); },
                         contentEditable: editable, row, fieldId, viewId, opts, fieldInfo, dragstart: startDrag,
                         selectionInfo, drop: opts.onDrop,
                         input: opts.onInput, keydown: opts.onKeydown, text: value};
        let blankClass = "madlib-blank";
        if(opts.selectable) {
          field.mousedown = selectBlank;
        }
        // @TODO: make focusing work
        if(focus && !focused) {
          field.postRender = drawn.focusOnce;
          focused = true;
        }
        if(selectionInfo && isSelected(selectionInfo)) {
          blankClass += " selected";
        }
        if(fieldInfo) {
          blankClass += ` ${fieldInfo.color}`;
          if(fieldInfo.constantValue !== undefined) {
            blankClass += " filtered";
            field.text = fieldInfo.constantValue;
            field.variable = fieldInfo;
          }
          if(row[fieldId] === undefined && fieldInfo.column) {
            blankClass += " column";
          }
        }
        items.push({ts: "td", c: blankClass, children: [
          field,
        ]});
        ix++;
      }
    }
    return {ts: "tr", c: "madlib", children: items};
  }

  function dropJoin(e, elem) {
    if(localState.selection.type === SelectionType.blank) {
      let blanks = localState.selection.items.slice();
      blanks.push(elem.selectionInfo);
      dispatch("joinBlanks", {blanks});
    }
  }

  function madlibForView(viewId, opts:any = {}): any {
    let {rows = [], joinInfo = {}, editable = false, adder = false, focus = false} = opts;
    // if we don't have any rows to draw, draw everything as empty
    if(!editable && (!rows.length || rows[0] === undefined)) {
      rows = [{}];
    }

    let madlib = ixer.selectOne("madlib", {view: viewId});
    if(!madlib) return;

    let parts = splitMadlibIntoParts(madlib["madlib: madlib"]);

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
      return madlibRow(viewId, parts, row, opts);
    });

    // the final madlib is a table of all the madlib items
    return {c: "madlib-container", children: [
      {ts: "table", c: "madlib-table", debug: viewId, children: rowItems}
    ]};
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
        let source = ixer.selectOne("source", {source: sourceId});
        let fieldId = binding["binding: field"];
        let sourceInfo = sourceFieldToVariable[sourceId];
        if(!sourceInfo) {
          sourceInfo = sourceFieldToVariable[sourceId] = {fields: {}, viewId: source["source: source view"]};
          if(ixer.selectOne("chunked source", {source: sourceId})) {
            sourceInfo["chunked"] = true;
          }
          if(ixer.selectOne("negated source", {source: sourceId})) {
            sourceInfo["negated"] = true;
          }
        }

        if(sourceInfo["chunked"] && !ixer.selectOne("grouped field", {source: sourceId, field: fieldId})) {
          variableInfo.column = true;
        }
        sourceFieldToVariable[sourceId].fields[fieldId] = variableInfo;
      }
    }
    return sourceFieldToVariable;
  }

  client.afterInit(() => {
    initLocalstate();
  });
}


