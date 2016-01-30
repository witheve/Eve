declare var pluralize; // @TODO: import me.
import {builtinId, copy} from "./utils";
import {Element, Handler} from "./microReact";
import {dispatch, eve} from "./app";
import {PANE} from "./ui";


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

function classifyEntities(rawEntities:string[]) {
  let entities = rawEntities.slice();
  let collections:string[] = [];
  let systems:string[] = [];

  // Measure relatedness of entities
  let relatedness:{[entity:string]: number} = {};
  for(let entity of entities) relatedness[entity] = eve.find("directionless links", {entity}).length;
  
  // Separate system entities
  let ix = 0;
  while(ix < entities.length) {
    if(eve.findOne("is a attributes", {collection: builtinId("system"), entity: entities[ix]})) {
      systems.push(entities[ix]);
      entities.splice(ix, 1);
    } else ix++;
  }
  
  // Separate user collections from other entities
  ix = 0;
  let collectionSize:{[collection:string]: number} = {};
  while(ix < entities.length) {
    let fact = eve.findOne("collection", {collection: entities[ix]});
    if(fact) {
      collectionSize[entities[ix]] = fact.count;
      collections.push(entities[ix]);
      entities.splice(ix, 1);
    } else ix++;
  }

  return {systems, collections, entities, relatedness, collectionSize};
}


//------------------------------------------------------------------------------
// Handlers
//------------------------------------------------------------------------------
function preventDefault(event) {
  event.preventDefault();
}
function preventDefaultUnlessFocused(event) {
  if(event.target !== document.activeElement) event.preventDefault();
}

function closePopup() {
  let popout = eve.findOne("ui pane", {kind: PANE.POPOUT});
  if(popout) dispatch("remove popup", {paneId: popout.pane}).commit();
}

function navigate(event, elem) {
  let {paneId} = elem.data;
  let info:any = {paneId, value: elem.link, peek: elem.peek};
  if(event.clientX) {
    info.x = event.clientX;
    info.y = event.clientY;
  }
  dispatch("ui set search", info).commit();
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

interface TableRowElem extends Element { table: string, row: any }
interface TableCellElem extends Element { row: TableRowElem, field: string }

function updateEntityValue(event:CustomEvent, elem:TableCellElem) {
  let value = event.detail;
  let {row:rowElem, field} = elem;
  let {table:tableElem, row} = rowElem;
  let entity = tableElem["entity"];
  if(field === "value" && row.value !== value && row.attribute !== undefined) dispatch("update entity attribute", {entity, attribute: row.attribute, prev: row.value, value}).commit();
  else if(field === "attribute" && row.attribute !== value && row.value !== undefined) dispatch("rename entity attribute", {entity, prev: row.attribute, attribute: value, value: row.value}).commit();
  rowElem.row = copy(row);
  rowElem.row[field] = value;
}
function updateEntityAttributes(event:CustomEvent, elem:{row: TableRowElem}) {
  let {table:tableElem, row} = elem.row;
  let entity = tableElem["entity"];
  if(event.detail === "add") dispatch("add entity attribute", {entity, attribute: "", value: ""}).commit(); // @FIXME This is dangerous
  else dispatch("remove entity attribute", {entity, attribute: row.attribute, value: row.value}).commit();
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
  elem["rows"] = attributes;
  elem["editCell"] = updateEntityValue;
  elem["editRow"] = updateEntityAttributes;
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
    elem.t = "input";
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

interface TableElem extends Element { rows: {}[], editCell?: Handler<Event>, editRow?: Handler<Event>, editField?: Handler<Event>, ignoreFields?: string[], ignoreTemp?: boolean, data?: any }
export function table(elem:TableElem):Element {
  let {rows, ignoreFields = ["__id"], ignoreTemp = true, data = undefined} = elem;
  if(!rows.length) {
    elem.text = "<Empty Table>";
    return elem;
  }

  let {editCell = undefined, editRow = undefined, editField = undefined} = elem;
  if(editCell) {
    let _editCell = editCell;
    editCell = function(event:Event, elem) {
      let node = <HTMLInputElement>event.target;
      let val = resolveValue(node.value);
      if(val === elem["original"]) return;
      let neueEvent = new CustomEvent("editcell", {detail: val});
      _editCell(neueEvent, elem);
    }
  }
  if(editRow) {
    var addRow = (evt, elem) => editRow(new CustomEvent("editrow", {detail: "add"}), elem);
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
  for(let field of fields) header.children.push(value({c: "column field", text: field, data, autolink: false}));
  
  let body = {c: "body", children: []};
  for(let row of rows) {
    let rowElem = {c: "row group", table: elem, row, children: []};
    for(let field of fields) rowElem.children.push(value({c: "column field", text: row[field], editable: editCell ? true : false, blur: editCell, row: rowElem, field, data}));
    if(editRow) rowElem.children.push({c: "controls", children: [{c: "remove-row ion-android-close", row: rowElem, click: removeRow}]});
    body.children.push(rowElem);
  }
  if(editRow) {
    let rowElem = {c: "row group add-row", table: elem, row: [], children: []};
    for(let field of fields) rowElem.children.push(value({c: "column field", editable: true, blur: editCell, row: rowElem, field, data}));
    body.children.push(rowElem);
  }

  elem.c = `table ${elem.c || ""}`;
  elem.children = [header, body];
  return elem;
}

interface DirectoryElem extends Element { entities:string[], data?:any }
export function directory(elem:DirectoryElem):Element {
  let {entities:rawEntities, data = undefined} = elem;
  let {systems, collections, entities, relatedness, collectionSize} = classifyEntities(rawEntities);
  collections.sort((a, b) =>
                   (collectionSize[a] === collectionSize[b]) ? 0 :
                   (collectionSize[a] === undefined) ? 1 :
                   (collectionSize[b] === undefined) ? -1 :
                   (collectionSize[a] > collectionSize[b]) ? -1 : 1);

  // @TODO: Highlight important system entities (e.g., entities, collections, orphans, etc.)
  // @TODO: Include dropdown pane of all other system entities
  // @TODO: Highlight the X largest user collections. Ghost in examples if not enough (?)
  // @TODO: Include dropdown pane of all other user collections (sorted alphh or # ?, inc. sorter?)
  // @TODO: Highlight the X (largest? most related?) entities (ghost examples if not enough (?)
  // @TODO: Include dropdown pane of other entities  
  
  return {c: "flex-column", children: [
    {c: "flex-column", children: collections.map(
      (entity) => ({c: "spaced-row flex-row", children: [link({entity, data}), {c: "flex-grow"}, {text: ""+collectionSize[entity]}]})
    )},
    {t: "hr"},
    {c: "flex-column", children: entities.map(
      (entity) => link({entity, data})
    )},
    {t: "hr"},
    {c: "flex-column", children: systems.map(
      (entity) => link({entity, data})
    )}
  ]};
}
