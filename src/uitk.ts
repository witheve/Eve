declare var pluralize; // @TODO: import me.
import {builtinId, copy, coerceInput, sortByLookup, sortByField, KEYS} from "./utils";
import {Element, Handler} from "./microReact";
import {dispatch, eve} from "./app";
import {PANE, uiState as _state} from "./ui";
import {masonry as masonryRaw, MasonryLayout} from "./masonry";

//------------------------------------------------------------------------------
// Utilities
//------------------------------------------------------------------------------
export function resolveName(maybeId:string):string {
  let display = eve.findOne("display name", {id: maybeId});
  return display ? display.name : maybeId;
}
export function resolveId(maybeName:string):string {
  let display = eve.findOne("display name", {name: maybeName});
  return display ? display.id : maybeName;
}
export function resolveValue(maybeValue:string):string {
  if(typeof maybeValue !== "string") return maybeValue;
  let val = maybeValue.trim();
  if(val.indexOf("=") === 0) {
    // @TODO: Run through the full NLP.
    let search = val.substring(1).trim();
    return resolveId(search);
  }
  return val;
}
export function isEntity(maybeId:string):boolean {
  return !!eve.findOne("entity", {entity: maybeId});
}

let wordSplitter = /\s+/gi;
const statWeights = {links: 100, pages: 200, words: 1};
function classifyEntities(rawEntities:string[]) {
  let entities = rawEntities.slice();
  let collections:string[] = [];
  let systems:string[] = [];

  // Measure relatedness + length of entities
  // @TODO: mtimes of entities
  let relatedCounts:{[entity:string]: number} = {};
  let wordCounts:{[entity:string]: number} = {};
  let childCounts:{[collection:string]: number} = {};
  let scores:{[entity:string]: number} ={};
  for(let entity of entities) {
    let {content = ""} = eve.findOne("entity", {entity}) || {};
    relatedCounts[entity] = eve.find("directionless links", {entity}).length;
    wordCounts[entity] = content.trim().replace(wordSplitter, " ").split(" ").length;
    let {count:childCount = 0} = eve.findOne("collection", {collection: entity}) || {};
    childCounts[entity] = childCount;
    scores[entity] =
      relatedCounts[entity] * statWeights.links +
      wordCounts[entity] * statWeights.words +
      childCounts[entity] * statWeights.pages;
  }
  
  // Separate system entities
  let ix = 0;
  while(ix < entities.length) {
    if(eve.findOne("is a attributes", {collection: builtinId("system"), entity: entities[ix]})) {
      systems.push(entities.splice(ix, 1)[0]);
    } else ix++;
  }
  
  // Separate user collections from other entities
  ix = 0;
  while(ix < entities.length) {
    if(childCounts[entities[ix]]) {
      collections.push(entities.splice(ix, 1)[0]);
    } else ix++;
  }

  return {systems, collections, entities, scores, relatedCounts, wordCounts, childCounts};
}


//------------------------------------------------------------------------------
// Handlers
//------------------------------------------------------------------------------
export function preventDefault(event) {
  event.preventDefault();
}
function preventDefaultUnlessFocused(event) {
  if(event.target !== document.activeElement) event.preventDefault();
}

function closePopup() {
  let popout = eve.findOne("ui pane", {kind: PANE.POPOUT});
  if(popout) dispatch("remove popup", {paneId: popout.pane}).commit();
}

export function navigate(event, elem) {
  let {paneId} = elem.data;
  if(elem.peek) dispatch("set popout", {parentId: paneId, rep: "@FIXME", params: "@FIXME", contains: elem.link, x: "calc(50% - 350px)", y: event.clientY}).commit();
  else dispatch("set pane", {paneId, contains: elem.link}).commit();
  event.preventDefault();
}

function navigateOrEdit(event, elem) {
  let popout = eve.findOne("ui pane", {kind: PANE.POPOUT});
  let peeking = popout && popout.contains === elem.link;
  if(event.target === document.activeElement) {}
  else if(!peeking) navigate(event, elem);
  else {
    closePopup();
    event.target.focus();
  }
}

interface TableRowElem extends Element { table: string, row: any, rows?: any[] }
interface TableCellElem extends Element { row: TableRowElem, field: string, rows?: any[]}
interface TableFieldElem extends Element { table: string, field: string, direction?: number }

function updateEntityValue(event:CustomEvent, elem:TableCellElem) {
  let value = coerceInput(event.detail);
  let {row:rowElem, field} = elem;
  let {table:tableElem, row} = rowElem;
  let entity = tableElem["entity"];
  let rows = elem.rows || [row];
  let chain = dispatch();
  for(let row of rows) {
    if(field === "value" && row.value !== value && row.attribute !== undefined) {
      chain.dispatch("update entity attribute", {entity, attribute: row.attribute, prev: row.value, value});
    } else if(field === "attribute" && row.attribute !== value && row.value !== undefined) {
      chain.dispatch("rename entity attribute", {entity, prev: row.attribute, attribute: value, value: row.value});
    }
  }
  chain.commit();
}
function updateEntityAttributes(event:CustomEvent, elem:{row: TableRowElem}) {
  let {table:tableElem, row} = elem.row;
  let entity = tableElem["entity"];
  if(event.detail === "add") {
    let state = elem["state"]["adder"];
    var valid = elem["fields"].every((field) => {
      return state[field] !== undefined;
    });
    if(valid) {
      dispatch("add sourced eav", {entity, attribute: state.attribute, value: resolveValue(state.value)}).commit();
      elem["state"]["adder"] = {};
    }
  } else {
    dispatch("remove entity attribute", {entity, attribute: row.attribute, value: row.value}).commit();
  }
}
function sortTable(event, elem:TableFieldElem) {
  let {key, field = undefined, direction = undefined} = elem;
  console.log(key, field, direction);
  if(field === undefined && direction === undefined) {
    field = event.target.value;
    console.log("ETV", field);
  }
  dispatch("sort table", {key, field, direction}).commit();
}

//------------------------------------------------------------------------------
// Embedded cell representation wrapper
//------------------------------------------------------------------------------
var uitk = this;
export function embeddedCell(elem):Element {
  let children = [];
  let {childInfo, rep} = elem;
  if(childInfo.constructor === Array) {
    for(let child of childInfo) {
      child["data"] = child["data"] || childInfo.params;
      children.push(uitk[rep](child));
    }
  } else {
    children.push(uitk[rep](childInfo));
  }
  children.push({c: "edit-button-container", children: [
    {c: "edit-button ion-edit", click: elem.click, cell: elem.cell}
  ]});
  return {c: "non-editing-embedded-cell", children, cell: elem.cell};
}

//------------------------------------------------------------------------------
// Representations for Errors
//------------------------------------------------------------------------------

export function error(elem):Element {
  elem.c = `error-rep ${elem.c || ""}`;
  console.log(elem);
  return elem;
}

//------------------------------------------------------------------------------
// Representations for Entities
//------------------------------------------------------------------------------
interface EntityElem extends Element { entity: string, data?: any }

export function name(elem:EntityElem):Element {
  let {entity} = elem;
  let {name = entity} = eve.findOne("display name", {id: entity}) || {};
  elem.text = name;
  elem.c = `entity ${elem.c || ""}`;
  return elem;
}

export function link(elem:EntityElem):Element {
  let {entity} = elem;
  let name = resolveName(entity);
  elem.c = `${elem.c || ""} entity link inline`;
  elem.text = elem.text || name;
  elem["link"] = elem["link"] || entity;
  elem.click = elem.click || navigate;
  elem["peek"] = elem["peek"] !== undefined ? elem["peek"] : true;
  return elem;
}

export function attributes(elem:EntityElem):Element {
  let {entity} = elem;
  let attributes = [];
  for(let eav of eve.find("entity eavs", {entity})) attributes.push({attribute: eav.attribute, value: eav.value});
  attributes.sort((a, b) => {
      if(a.attribute === b.attribute) return 0;
      else if(a.attribute < b.attribute) return -1;
      return 1;
  })
  elem["groups"] = ["attribute"];
  elem["rows"] = attributes;
  elem["editCell"] = updateEntityValue;
  elem["editRow"] = updateEntityAttributes;
  elem["noHeader"] = true;
  return table(<any>elem);
}

export function related(elem:EntityElem):Element {
  let {entity, data = undefined} = elem;
  let name = resolveName(entity);
  let relations = [];
  for(let link of eve.find("directionless links", {entity})) relations.push(link.link);
  elem.c = elem.c !== undefined ? elem.c : "flex-row flex-wrap csv";
  if(relations.length) {
    elem.children = [{t: "h2", text: `${name} is related to ${relations.length} ${pluralize("entities", relations.length)}:`}];
    for(let rel of relations) elem.children.push(link({entity: rel, data}));

  } else elem.text = `${name} is not related to any other entities.`;
  return elem;
}

export function index(elem:EntityElem):Element {
  let {entity} = elem;
  let name = resolveName(entity);
  let facts = eve.find("is a attributes", {collection: entity});
  let list = {t: "ul", children: []};
  for(let fact of facts) list.children.push(link({t: "li", entity: fact.entity, data: elem.data}));
  
  elem.children = [
    {t: "h2", text: `There ${pluralize("are", facts.length)} ${facts.length} ${pluralize(name, facts.length)}:`},
    list
  ];
  return elem;
}

export function view(elem:EntityElem):Element {
  let {entity} = elem;
  let name = resolveName(entity);
  // @TODO: Check if given entity is a view, or render an error
  
  let rows = eve.find(entity);
  elem["rows"] = rows;
  return table(<any>elem);
}

export function results(elem:EntityElem):Element {
  let {entity, data = undefined} = elem;
  elem.children = [name({entity, data})];
  for(let eav of eve.find("entity eavs", {entity, attribute: "artifact"})) {
    elem.children.push(
      name({t: "h3", entity: eav.value, data}),
      view({entity: eav.value, data})
    );
  }
  return elem;
}

//------------------------------------------------------------------------------
// Representations for values
//------------------------------------------------------------------------------
interface ValueElem extends Element { editable?: boolean, autolink?: boolean }
export function value(elem:ValueElem):Element {
  let {text:val = "", autolink = true, editable = false} = elem;
  elem["original"] = val;
  let cleanup;
  if(isEntity(val)) {
    elem["entity"] = val;
    elem.text = resolveName(val);
    if(autolink) elem = link(<any>elem);
    if(editable && autolink) {
      elem.mousedown = preventDefaultUnlessFocused;
      elem.click = navigateOrEdit;
      cleanup = closePopup;
    }
  }
  if(editable) {
    if(elem.t !== "input") {
      elem.contentEditable = true;
    }
    // elem.t = "input";
    elem.placeholder = "<empty>";
    elem.value = elem.text || "";
    let _blur = elem.blur;
    elem.blur = (event:FocusEvent, elem:Element) => {
      let node = <HTMLInputElement>event.target;
      if(_blur) _blur(event, elem);
      if(node.value === `= ${elem.value}`) node.value = elem.value;
      if(elem.value !== val) node.classList.add("link");
      if(cleanup) cleanup(event, elem);
    };

    let _focus = elem.focus;
    elem.focus = (event:FocusEvent, elem:Element) => {
      let node = <HTMLInputElement>event.target;
      if(elem.value !== val) {
        node.value = `= ${elem.value}`;
        node.classList.remove("link");
      }
      if(_focus) _focus(event, elem);
    };
  }
  return elem;
}

interface CSVElem extends Element { values: any[], autolink?: boolean }
export function CSV(elem:CSVElem):Element {
  let {values, autolink = undefined, data} = elem;
  return {c: "flex-row csv", children: values.map((val) => value({t: "span", autolink, text: val, data}))};
}

interface TableElem extends Element { rows: {}[], sortable?: boolean, editCell?: Handler<Event>, editRow?: Handler<Event>, editField?: Handler<Event>, ignoreFields?: string[], ignoreTemp?: boolean, data?: any, groups?: string[]}
export function table(elem:TableElem):Element {
  let {rows, ignoreFields = ["__id"], sortable = false, ignoreTemp = true, data = undefined, noHeader = false, groups = []} = elem;
  if(!rows.length) {
    elem.text = "<Empty Table>";
    return elem;
  }
  if(sortable && !elem.key) throw new Error("Cannot track sorting state for a table without a key");

  let localState:any = _state.widget.table[elem.key] || {};
  _state.widget.table[elem.key] = localState;

  let {editCell = undefined, editRow = undefined, editField = undefined} = elem;
  if(editCell) {
    let _editCell = editCell;
    editCell = function(event:Event, elem) {
      let node = <HTMLInputElement>event.target;
      let val;
      if(node.nodeName === "INPUT") {
        val = resolveValue(node.value);
      } else {
        val = resolveValue(node.textContent);
      }
      if(val === elem["original"]) return;
      let neueEvent = new CustomEvent("editcell", {detail: val});
      _editCell(neueEvent, elem);
    }
  }
  if(editRow) {
    var addRow = (evt, elem) => {
      let event = new CustomEvent("editrow", {detail: "add"});
      editRow(event, elem);
    }
    var trackInput = (evt, elem) => {
      let node = <HTMLInputElement>evt.target;
      localState["adder"][elem["field"]] = node.value;
      dispatch().commit();
    }
    var removeRow = (evt, elem) => editRow(new CustomEvent("editrow", {detail: "remove"}), elem);
  }
  if(editField) {
    // @FIXME: Wrap these with the logic for the editing modal, only add/remove on actual completed field
    var addField = (evt, elem) => editRow(new CustomEvent("editfield", {detail: "add"}), elem);
    var removeField = (evt, elem) => editRow(new CustomEvent("editfield", {detail: "remove"}), elem);
  }

  // Collate non-ignored fields
  let fields = Object.keys(rows[0]);
  let fieldIx = 0;
  while(fieldIx < fields.length) {
    if(ignoreFields && ignoreFields.indexOf(fields[fieldIx]) !== -1) fields.splice(fieldIx, 1);
    else if(ignoreTemp && fields[fieldIx].indexOf("$$temp") === 0) fields.splice(fieldIx, 1);
    else fieldIx++;
  }

  let header = {t: "header", children: []};
  let {field:sortField = undefined, direction:sortDirection} = localState;
  sortDirection = sortDirection || 1;
  for(let field of fields) {
    let isActive = field === sortField;
    let direction = (field === sortField) ? sortDirection : 0;
    header.children.push({c: "column field flex-row", children: [
      value({text: field, data, autolink: false}),
      {c: "flex-grow"},
      {c: "controls", children: [
        sortable ? {
          c: `sort-toggle ${isActive && direction < 0 ? "ion-arrow-up-b" : "ion-arrow-down-b"} ${isActive ? "active" : ""}`,
          key: elem.key,
          field,
          direction: -direction,
          click: sortTable
        } : undefined
      ]}
    ]});
  }

  if(sortable && sortField) {
    let back = -1 * sortDirection;
    let fwd = sortDirection;
    rows.sort(function sorter(rowA, rowB) {
      let a = resolveName(resolveValue(rowA[sortField])), b = resolveName(resolveValue(rowB[sortField]));
      return (a === b) ? 0 :
        (a === undefined) ? fwd :
        (b === undefined) ? back :
        (a > b) ? fwd : back;
    });
  }

  //@TODO: allow this to handle multiple groups
  if(groups.length > 1) throw new Error("Tables only support grouping on one field");
  if(groups.length) {
    let [toGroup] = groups;
    rows.sort((a, b) => {
      let ag = a[toGroup];
      let bg = b[toGroup];
      if(ag === bg) return 0;
      if(ag < bg) return -1;
      return 1;
    });
  }

  //@FIXME: the grouping strategy here is a disaster
  let body = {c: "body", children: []};
  let ix = 0;
  let rowsLen = rows.length;
  while(ix < rowsLen) {
    let row = rows[ix];
    let rowElem = {c: "row group", table: elem, row, children: []};
    for(let grouped of groups) {
      let collected = [];
      rowElem.children.push(value({c: "column field", text: row[grouped], editable: editCell ? true : false, blur: editCell, row: rowElem, grouped: true, rows: collected, field: grouped, data, keydown: handleCellKeys}));
      let subgroup = {c: "column sub-group", table: elem, row, children: []};
      rowElem.children.push(subgroup);
      let subrow = rows[ix];
      while(ix < rowsLen && subrow[grouped] === row[grouped]) {
        let subrowElem = {c: "sub-row", table: elem, row: subrow, children: []};
        subgroup.children.push(subrowElem);
        collected.push(subrow);
        for(let field of fields) {
          if(field === grouped) continue;
          subrowElem.children.push(value({c: "field", text: subrow[field], editable: editCell ? true : false, blur: editCell, row: subrowElem, field, data, keydown: handleCellKeys}));
        }
        if(editRow) subrowElem.children.push({c: "controls", children: [{c: "remove-row ion-android-close", row: subrowElem, click: removeRow}]});
        ix++;
        subrow = rows[ix];
      }
    }
    if(groups.length === 0) {
        for(let field of fields) {
          rowElem.children.push(value({c: "column field", text: row[field], editable: editCell ? true : false, blur: editCell, row: rowElem, field, data, keydown: handleCellKeys}));
        }
        if(editRow) rowElem.children.push({c: "controls", children: [{c: "remove-row ion-android-close", row: rowElem, click: removeRow}]});
        ix++;
    }
    body.children.push(rowElem);
  }
  if(editRow) {
    if(!localState["adder"]) {
      localState["adder"] = {};
    }
    let rowElem = {c: "row group add-row", table: elem, row: [], children: []};
    for(let field of fields) rowElem.children.push(value({t: "input", c: "column field", editable: true, input: trackInput, blur: addRow, row: rowElem, keydown: handleCellKeys, attribute: field, field, fields, data, table: elem, state: localState, text: localState["adder"][field] || ""}));
    body.children.push(rowElem);
  }

  elem.c = `table ${elem.c || ""}`;
  elem.children = [header, body];
  if(noHeader) {
      elem.children.shift();
  }
  return elem;
}

function handleCellKeys(event, elem) {
  if(event.keyCode === KEYS.ENTER) {
    elem.blur(event, elem);
    event.preventDefault();
  }
}

interface TableFilterElem extends Element { key: string, sortFields?: string[], search?: (search:string) => string[]|Element[] }
export function tableFilter(elem:TableFilterElem) {
  let {key, search = undefined, sortFields = undefined} = elem;
  elem.children = [];
  if(sortFields) {
    let state = _state.widget.table[key] || {field: undefined, direction: undefined};
    let sortOpts = [];
    for(let field of sortFields) {
      sortOpts.push({t: "option", text: resolveName(field), value: field, selected: field === state.field});
    }
    elem.children.push({c: "flex-grow"});
    elem.children.push({c: "sort", children: [
      {text: "Sort by"},
      {t: "select", c: "select-sort-field select", value: state.field, children: sortOpts, key, change: sortTable},
      {c: `toggle-sort-dir ${state.direction === -1 ? "ion-arrow-up-b" : "ion-arrow-down-b"}`, key, direction: -state.direction || 1, click: sortTable},
    ]});
  }
  elem.c = `table-filter ${elem.c || ""}`;
  return elem;
}

interface URLElem extends Element { url: string }
export function externalLink(elem:URLElem) {
  elem.t = "a";
  elem.c = `link ${elem.c || ""}`;
  elem.href = elem.url;
  elem.text = elem.text || elem.url;
  return elem;
}

export function externalImage(elem:URLElem) {
  elem.t = "img";
  elem.c = `img ${elem.c || ""}`;
  elem.src = elem.url;
  return elem;
}

export function externalVideo(elem:URLElem) {
  let ext = elem.url.slice(elem.url.lastIndexOf(".")).trim().toLowerCase();
  let domain = elem.url.slice(elem.url.indexOf("//") + 2).split("/")[0];
  let isFile = ["mp4", "ogv", "webm", "mov", "avi", "flv"].indexOf(ext) !== -1;
  if(isFile) {
    elem.t = "video";
  } else {
    elem.t = "iframe";
  }
  elem.c = `video ${elem.c || ""}`;
  elem.src = elem.url;
  elem.allowfullscreen = true;
  return elem;
}

//------------------------------------------------------------------------------
// Containers
//------------------------------------------------------------------------------
interface CollapsibleElem extends Element { key:string, header?:Element, open?:boolean }
export function collapsible(elem:CollapsibleElem):Element {
  if(elem.key === undefined) throw new Error("Must specify a key to maintain collapsible state");
  let state = _state.widget.collapsible[elem.key] || {open: elem.open !== undefined ? elem.open : true};
  let content = {children: elem.children};
  let header = {t: "header", children: [{c: "collapse-toggle " + (state.open ? "ion-chevron-up" : "ion-chevron-down"), collapsible: elem.key, open: state.open, click: toggleCollapse}, elem.header]};

  elem.c = `collapsible ${elem.c || ""}`;
  elem.children = [header, state.open ? content : undefined];
  return elem;
}

function toggleCollapse(evt, elem) {
  dispatch("toggle collapse", {collapsible: elem.collapsible, open: !elem.open});
}

let directoryTileLayouts:MasonryLayout[] = [
  {size: 4, c: "big", format(elem) {
    elem.children.unshift
    elem.children.push(
      {text: `(${elem["stats"][elem["stats"].best]} ${elem["stats"].best})`}
    );
    return elem;
  }},
  {size: 2, c: "detailed", format(elem) {
    elem.children.push(
      {text: `(${elem["stats"][elem["stats"].best]} ${elem["stats"].best})`}
    );
    return elem;
  }},
  {size: 1, c: "normal", grouped: 2}
];
let directoryTileStyles = ["tile-style-1", "tile-style-2", "tile-style-3", "tile-style-4", "tile-style-5", "tile-style-6", "tile-style-7"];

// @TODO: Clean up directory elem
interface DirectoryElem extends Element { entities:string[], data?:any }
export function directory(elem:DirectoryElem):Element {
  const MAX_ENTITIES_BEFORE_OVERFLOW = 14;
  let {entities:rawEntities, data = undefined} = elem;
  let {systems, collections, entities, scores, relatedCounts, wordCounts, childCounts} = classifyEntities(rawEntities);
  let sortByScores = sortByLookup(scores);
  entities.sort(sortByScores);
  collections.sort(sortByScores);
  systems.sort(sortByScores);

  // Link to entity
  // Peek with most significant statistic (e.g. 13 related; or 14 childrenpages; or 5000 words)
  // Slider pane will all statistics
  // Click opens popup preview
  function formatTile(entity) {
    let stats = {best:"", links: relatedCounts[entity], pages: childCounts[entity], words: wordCounts[entity]};
    let maxContribution = 0;
    for(let stat in stats) {
      if(!statWeights[stat]) continue;
      let contribution = stats[stat] * statWeights[stat];
      if(contribution > maxContribution) {
        maxContribution = contribution;
        stats.best = stat;
      }
    }
    return {size: scores[entity], stats, children: [
      link({entity, data})
    ]};
  }

  function formatOverflow(key:string, entities, skipChildren:boolean = false) {
    let rows = [];
    for(let entity of entities) {
      rows.push({
        name: entity,
        score: scores[entity],
        words: wordCounts[entity],
        links: relatedCounts[entity],
        pages: childCounts[entity]
      });
      if(skipChildren) delete rows[rows.length - 1].pages;
    }
    return table({c: "overflow-list", key, rows, sortable: true, data});
  }
  
  // @TODO: Put formatOverflow into a collapsed container.
  return {c: "directory flex-column", children: [
    {t: "h2", text: "Collections"},
    masonry({c: "directory-listing", layouts: directoryTileLayouts, styles: directoryTileStyles, children: collections.map(formatTile)}),

    {t: "h2", text: "Entities"},
    masonry({c: "directory-listing", layouts: directoryTileLayouts, styles: directoryTileStyles, children: entities.slice(0, MAX_ENTITIES_BEFORE_OVERFLOW).map(formatTile)}),
    collapsible({
      key: `${elem.key}|directory entities collapsible`,
      header: {text: "Show all entities..."},
      children: [
        //tableFilter({key: `${elem.key}|directory entities overflow`, sortFields: ["name", "score", "words", "links"]}),
        formatOverflow(`${elem.key}|directory entities overflow`, entities, true)
      ],
      open: false
    }),
    
    {t: "h2", text: "Internals"},
    collapsible({
      key: `${elem.key}|directory systems collapsible`,
      header: {text: "Show all internal entities..."},
      children: [formatOverflow(`${elem.key}|directory systems overflow`, systems)],
      open: false
    }),
  ]};
}

export var masonry = masonryRaw;

