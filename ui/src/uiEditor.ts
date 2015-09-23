/// <reference path="./microReact.ts" />
/// <reference path="./ui.ts" />
module uiEditor {
  //---------------------------------------------------------
  // Types
  //---------------------------------------------------------
  type Element = microReact.Element;
  type Content = (() => Element)|(() => Element[])|string|Element|Element[];
  type Handler = microReact.Handler<Event>;

  interface EditorState {
    tableFields: {[id:string]: string[]}
  }

  //---------------------------------------------------------
  // Utils
  //---------------------------------------------------------
  function preventDefault(evt:Event) {
    evt.preventDefault();
  }

  let selection = {
    field: () => api.localState.selection.type === madlib.SelectionType.field ? api.localState.selection.items[0].fieldId : undefined,
    blank: () => {
      if(api.localState.selection.type !== madlib.SelectionType.blank) { return; }
      let blank = api.localState.selection.items[0];
      return api.ixer.selectOne("binding", {source: blank.sourceId, field: blank.fieldId})["binding: variable"];
    }
  };

  //---------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------
  export var onChange = () => undefined;
  export var editorState:EditorState = {
    tableFields: {}
  };

  export function init(localState:any, changeHandler:() => void) {
    onChange = changeHandler;
    if(!localState.uiEditorState) {
      localState.uiEditorState = editorState;
    } else {
      editorState = localState.uiEditorState;
    }
  }

  interface DispatchEffects {
    rerender?:boolean,
    changes?:api.Change<any>[],
    commands?:api.Diff[]
  }
  var dispatches:{[evt:string]: (info:{}) => DispatchEffects} = {
    bindAttribute: ({elementId, property, fieldId}:{elementId:string, property:string, fieldId:string}) => {
      let changes = [
        api.remove("uiAttributeBinding", {element: elementId, property}),
        api.insert("uiAttributeBinding", {element: elementId, property, field: fieldId})
      ];
      return {changes};
    },
    addFieldToTable: ({elementId, fieldId}:{elementId:string, fieldId:string}) => {
      // @TODO(joshuafcole): Need to make this persistent.
      let fieldIds = editorState.tableFields[elementId] || [];
      if(fieldIds.indexOf(fieldId) === -1) {
        fieldIds.push(fieldId);
      }
      editorState.tableFields[elementId] = fieldIds;
      return {};
    }
  };
  export function dispatch(evt:string, info:any, rentrant?:boolean):DispatchEffects {
    if(!dispatches[evt]) {
      console.error("Unknown dispatch:", event, info);
      return;
    } else {
      let {rerender = true, changes, commands} = dispatches[evt](info);
      if(rerender && !rentrant) {
        onChange();
      }
      return {rerender, changes, commands};
    }
  }

  //---------------------------------------------------------
  // Component editors
  //---------------------------------------------------------
  interface BindableAttributeElement extends Element {
    elementId: string
    property: string
  }
  export function bindableAttribute(elem:BindableAttributeElement):Element {
    elem.c = `bindable ${elem.c || ""}`;

    return elem;
  }
  function bindAttribute(evt, elem) {
    let fieldId = selection.field();
    if(!fieldId) { return; }
    dispatch("bindAttribute", {elementId: elem.elementId, property: elem.property, fieldId});
    evt.stopPropagation();
    evt.preventDefault();
  }

  interface TableEditorElement extends Element {
    view: string
  }
  export function table(elem:TableEditorElement) {
    let fieldIds = editorState.tableFields[elem.id] || [];
    let fieldColors = {};

    var colors = ["blue", "purple", "green", "orange", "teal", "red"];
    for(let fieldId of fieldIds) {
      let select = api.ixer.selectOne("select", {field: fieldId});
      let variableId = select["select: variable"];
      let variableBindings = api.ixer.select("binding", {variable: variableId});
      if(variableBindings.length > 1) {
        fieldColors[fieldId] = colors.shift();
      }
    }

    function headerRenderer(header) {
      header.c += " attribute-blank " + fieldColors[header.header];
      return header;
    }

    elem.c = `table-editor ${elem.c || ""}`;
    elem.dragover = preventDefault;
    elem.drop = addFieldToTable;
    elem.children = [
      ui.factTable({id: `${elem.id}-inner`, view: elem.view, headers: fieldIds, headerRenderer}),
      (fieldIds.length < 1 ? {text: "Drop fields onto the table to show them"} : undefined)
    ];
    return elem;
  }
  function addFieldToTable(evt, elem) {
    let fieldId = selection.field();
    if(!fieldId) {
      let variableId = selection.blank();
      let select = api.ixer.selectOne("select", {variable: variableId});
      if(!select) { return; }
      fieldId = select["select: field"];
    }
    dispatch("addFieldToTable", {elementId: elem.id, fieldId});
  }
}