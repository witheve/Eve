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
  const NO_SELECTION = -1;

  let workspaceItems = [{type: "table", id: 0, view: "view"}];

  function initLocalstate() {
    localState.search = {value: false, selected: NO_SELECTION, completions: []};
  }

  ixer.select("view", {}).forEach((view, ix) => {
    //workspaceItems.push({type: view["view: kind"], id: ix, view: view["view: view"]});
  })

  function dispatch(event, info, rentrant = false) {
    var diffs = [];
    var commands = [];
    var storeEvent = true;

    switch(event) {
      case "setMadlibSearch":
        localState.search.value = info.value;
        localState.search.completions = getCompletions(info.value);
        break;
      case "cellTab":
        break;

      case "searchSelect":
        let size = Math.min(MAX_COMPLETIONS, localState.search.completions.length)
        localState.search.selected += info.direction;
        if(localState.search.selected < NO_SELECTION) {
          localState.search.selected = size - 1;
        } else if(localState.search.selected > size - 1) {
          localState.search.selected = NO_SELECTION;
        }
        break;
      case "submitSearch":
        if(info.selected === NO_SELECTION) {
          // TODO: create a madlib
        } else {
          console.log("do something with: ", info.completions[info.selected]);
        }
        break;
      case "":

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
      let actions = {};
      let disabled = {};
      return drawn.leftToolbar(actions, disabled);
    }

  function workspaceCanvas() {
    var items = workspaceItems.map((item) => {
      if(item.type === "table") {
        return tableItem(item);
      } else if(item.type === "join") {
        return joinItem(item);
      }
    });
    return {c: "canvas", children: [multiInput()]};
  }

  function joinItem(item) {
    let joinInfo = getJoinInfo(item.view);
    let sources = ixer.select("source", {view: item.view}).map((source) => {
      let sourceId = source["source: source"];
      let sourceView = source["source: source view"];
      return madlibForView(sourceView, [ixer.selectOne(sourceView, {})], joinInfo[sourceId]);
    });
    return {c: "item", children: sources};
  }

  function tableItem(item) {
    return {c: "item", children: [
      madlibForView(item.view, ixer.select(item.view, {}))
    ]};
  }

  enum multiInputState { query, add, remove }

  function multiInput() {
    let mode = multiInputState.query;
    return {c: "multi-input", children: [
      {c: "switcher", children: [
        {c: "switcher-value", text: mode === multiInputState.query ? "?" : "+"},
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
    let currentMadlib;
    if(localState.search.selected === NO_SELECTION) {
      currentMadlib =  {t: "table", c: "madlib-table", children: [
        {t: "tr", c: "madlib", children: [
          {t: "td", c: "madlib-blank", children: [
            {c: "madlib-text", postRender: drawn.focusOnce, contentEditable: true, text: searchValue, input: setMadlibSearch, keydown: cellKeyDown},
          ]}
        ]}
      ]};
    } else if(selected) {
      currentMadlib = madlibForView(selected.viewId);
      focus = true;
    }
    return {c: "madlib-searcher", key: localState.search.selected, postRender: focus ? (node) => {console.log("here"); node.focus()} : undefined,
            tabindex: -1, keydown: cellKeyDown, children: [
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
      dispatch("submitSearch", {selected: localState.search.selected, completions: localState.search.completions});
      e.preventDefault();
    }
    e.stopPropagation();
  }

  function setCell(e, elem) {
    dispatch("setCell", {});
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
        let madlib = madlibForView(viewId, [ixer.selectOne(viewId, {})]);
        madlib.selectedIndex = ix;
        madlib.click = submitCompletion;
        madlib.score = score;
        if(ix === searchSelected) {
          madlib.c += " selected";
        }
        return madlib;
      });
      return {c: "completions", children: displayResults}
    }
  }

  function submitCompletion(e, elem) {
    dispatch("submitSearch", {selected: elem.selectedIndex, completions: localState.search.completions})
  }

  function madlibForView(viewId, rows = [], joinInfo = {}, focus = false): any {
    // if we don't have any rows to draw, draw everything as empty
    if(!rows.length || rows[0] === undefined) {
      rows = [{}];
    }

    // we draw a madlib based on a combination of descriptors and fields, which are
    // ordered against eachother
    let descriptors = ixer.select("madlib descriptor", {view: viewId});
    let madlibBlanks = ixer.select("field", {view: viewId}).concat(descriptors);
    madlibBlanks.sort((a, b) => {
      var aIx = a["madlib descriptor: ix"] || ixer.selectOne("display order", {id: a["field: field"]})["display order: priority"];
      var bIx = b["madlib descriptor: ix"] || ixer.selectOne("display order", {id: b["field: field"]})["display order: priority"];
      return bIx - aIx;
    });

    let focused = false;
    // for each row we're supposed to render, draw the madlib
    let rowItems = rows.map((row) => {
      let items = madlibBlanks.map((descriptor) => {
        if(descriptor["madlib descriptor: content"]) {
            return {t: "td", c: "madlib-blank", children: [
              {c: "madlib-text", text: descriptor["madlib descriptor: content"]}
            ]};
          } else {
            let fieldId = descriptor["field: field"];
            let color = joinInfo[fieldId] ? joinInfo[fieldId].color : "";
            let name = code.name(fieldId);
            let value = row[fieldId] !== undefined ? row[fieldId] : "";
            let field:any = {c: "value", contentEditable: true, text: value};
            if(focus && !focused) {
              field.postRender = drawn.focusOnce;
              focused = true;
            }
            return {t: "td", c: `madlib-blank ${color}`, children: [
              field,
              {c: "label", text: name}
            ]}
          }
      });

      if(!descriptors.length) {
        items.unshift({t: "td", c: "madlib-blank", children: [
          {c: "madlib-text", text: code.name(viewId)}
        ]});
      }
      return {t: "tr", c: "madlib", children: items};
    });

    // the final madlib is a table of all the madlib items
    return {t: "table", c: "madlib-table", debug: viewId, children: rowItems};
  }

  window["drawn"].root = root;


  function getJoinInfo(joinId) {
    // This translates our normalized AST into a set of denomralized graphical nodes.
    var colors = ["blue", "purple", "green", "orange", "teal", "red"];
    var sourceFieldToVariable = {};
    let variables = ixer.select("variable", {view: joinId});
    for(let variableRow of variables) {
      let variableId = variableRow["variable: variable"];
      let bindings = ixer.select("binding", {variable: variableId});
      let constants = ixer.select("constant binding", {variable: variableId});
      let ordinals = ixer.select("ordinal binding", {variable: variableId});
      let variable:any = {variable: variableId};

      if(bindings.length) {
        let singleBinding = bindings.length === 1;

        if(!singleBinding) {
          variable.color = colors.shift();
        }

        // run through the bindings once to determine if it's an entity, what it's name is,
        // and all the other properties of this node.
        for(let binding of bindings) {
          let sourceId = binding["binding: source"];
          let fieldId = binding["binding: field"];
          let field = ixer.selectOne("field", {field: fieldId});
          if(!sourceFieldToVariable[sourceId]) {
            sourceFieldToVariable[sourceId] = {};
          }
          sourceFieldToVariable[sourceId][fieldId] = variable;
        }
      }
    }
    return sourceFieldToVariable;
  }

  client.afterInit(() => {
    initLocalstate();
  });
}


