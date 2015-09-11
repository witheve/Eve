/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/tableEditor.ts" />
/// <reference path="../src/glossary.ts" />
/// <reference path="../src/layout.ts" />

module uitk {
  declare var Papa;
  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;
  const onChange = drawn.render;

  localState.example = {
    uiElements: {}
  };

  var dispatches:{[evt:string]: (info:{}) => boolean} = {
    toggleRenderElement({elementId}:{elementId: string}) {
      let rendering = localState.example.uiElements[elementId];
      if(rendering) {
        delete localState.example.uiElements[elementId];
      } else {
        localState.example.uiElements[elementId] = true;
      }
      return true;
    }
  };

  export function dispatch(evt:string, info:any) {
    if(!dispatches[evt]) {
      console.error("Unknown dispatch:", event, info);
      return;
    } else {
      let changed = dispatches[evt](info);
      if(changed) {
        onChange();
      }
    }
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


  function makeExamplePanes(suffix):ui.Pane[] {
    return [
      {
        id: `pane1#${suffix}`, title: "Pane 1",
        content: () => {return {text: "This is Pane 1"}}
      },
      {
        id: `pane2#${suffix}`, title: "Pane 2",
        content: () => {return {text: "This is Pane 2"}}
      },
      {
        id: `pane3#${suffix}`, title: "Pane 3",
        content: () => {return { children: [{text: "This is Pane 3"}, ui.button({text: "Button!"})]}}
      }
    ];
  }

  function toggleElementRendering(evt, elem) {
    dispatch("toggleRenderElement", {elementId: elem.element});
  }

  function workspaceCanvas() {
    const renderer = drawn.renderer;
    var data = [
      {name: "Corey", title: "Lead Roboticist"},
      {name: "Rob", title: "COO"},
      {name: "Chris", title: "CEO"},
      {name: "Josh", title: "Man of Distinction"},
      {name: "Jamie", title: "CTO"}
    ];

    var columns = ["name","title"];
    let data1: ui.ChartData = {label: "data1", ydata: [130]};
    let data2: ui.ChartData = {label: "data2", ydata: [130]};
    let data3: ui.ChartData = {label: "data3", ydata: [270]};

    let uiElements = (ixer.select("uiElement", {}) || []).map(function(fact) {
      let {"uiElement: element": id, "uiElement: parent": parent} = fact;
      if(parent) {
        return {c: "list-item disabled", text: `${id} < ${parent}`, hasParent: 1};
      } else {
        return ui.row({c: "spaced-row list-item", hasParent: 0, children: [
          ui.checkbox({change: toggleElementRendering, element: id}),
          {text: id}
        ]})
      }
    });
    uiElements.sort((a, b) => a["hasParent"] - b["hasParent"]);

    return {c: "wrapper", children: [{c: "canvas", children: [
      {t: "h1", text: "Containers"},
      {c: "group containers", children: [
        {t: "h2", text: "Tabbed Box :: ui.tabbedBox({panes: Pane[], defaultTab?:string, controls?: Element[]})"},
        ui.tabbedBox({
          defaultTab: "pane2#tabbedBox",
          panes: makeExamplePanes("tabbedBox"),
          controls: [{c: "ion-close tab", click: null}, {c: "ion-search tab", click: null}]
        }),

        {t: "h2", text: "Accordion :: ui.accordion({panes: Pane[], defaultPane?:string, horizontal?: boolean})"},
        ui.accordion({id:"example-accordion", panes: makeExamplePanes("accordion")}),

        {t: "h2", text: "Row: ui.row({})"},
        ui.row({c: "spaced-row", children: [{text: "foo"}, {text: "bar"}, {text: "baz"}]}),

        {t: "h2", text: "Column: ui.column({})"},
        ui.column({children: [{text: "foo"}, {text: "bar"}, {text: "baz"}]}),

        {t: "h2", text: "Dropdown: ui.dropdown({options:string[], size?:number,  multiple:boolean = false, defaultOption?: number})"},
        {text: "What is size, multiple, and defaultOption? They don't seem to be used?"},
        ui.dropdown({options: ["one", "two", "three"]})
      ]},

      {t: "h1", text: "Inputs"},
      {c: "group inputs", children: [
        {t: "h2", text: "Button: ui.button({})"},
        ui.button({text: "Button 1"}),

        {t: "h2", text: "Checkbox: ui.checkbox({checked:boolean = false})"},
        ui.row({children: [{text: "Default"}, ui.checkbox({})]}),
        ui.row({children: [{text: "Checked"}, ui.checkbox({checked: true})]}),

        {t: "h2", text: "Input: ui.input({multiline:boolean = false, normalize:boolean = true})"},
        {text: "Single line"},
        ui.input({multiline: false}),
        {text: "Multiline"},
        ui.input({multiline: true}),
      ]},

      {t: "h1", text: "Components"},
      {c: "group components", children: [
        {t: "h2", text: "ui.chart({...})"},
        ui.chart({chartData: [data1], chartType: ui.ChartType.GAUGE}),
        {t: "h2", text: "ui.image({backgroundImage:string})"},
        ui.image({backgroundImage: "http://witheve.com/logo.png", height: "100", width: "100"}),
        {t: "h2", text: "ui.table({...})"},
        ui.table({data: data}),
        {t: "h2"},
        ui.table({data: data, headers: ["name"]}),
        {t: "h2"},
        ui.table({data: [[1, 2, 3], ["a", "b", "c"], ["A", "B", "C"]]}),
        {t: "h2"},
        ui.table({headers: ["Field A", "Field B", "Field C"], data: [[1, 2, 3], ["a", "b", "c"], ["A", "B", "C"]]})
      ]},

      {t: "h1", text: "Dynamic Rendering"},
      {c: "group", children: [
        {text: "The uiRenderer renders declaratively using the contents of the uiElement, uiAttribute, uiBoundElement, and uiBoundAttribute tables."},
        {t: "h2"},
        ui.row({height: 480, children: [
          {flex: 2, children: uiElements || [{text: "Add entries in uiElement to render."}]},
          {flex: 8, id: "ui-renderer-example", c: "renderer", children: renderer.compile(Object.keys(localState.example.uiElements))}
        ]})
      ]}
    ]}]};
  }


  window["drawn"].root = root;
  client.afterInit(() => {});
}
