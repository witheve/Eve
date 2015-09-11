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

  var dispatches:{[evt:string]: (info:{}) => boolean} = {
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

  let generation = 0;

  function workspaceCanvas() {
    const renderer = drawn.renderer;
    var data = [
                {name: "Corey", title: "Lead Roboticist"},
                {name: "Rob", title: "COO"},
                {name: "Chris", title: "CEO"},
                {name: "Josh", title: "Man of Distinction"},
                {name: "Jamie", title: "CTO"}
    ];
    let data1: ui.ChartData = {label: "data1", data: [30, 200, 100, 400, 150, 250, 30]};
    let data2: ui.ChartData = {label: "data2", data: [130, 100, 140, 200, 150, 50,70]};
    var columns = ["name","title"];
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

    return {c: "wrapper", children: [{c: "canvas", children: [
      {t: "h1", text: "Containers"},
      {c: "group containers", children: [
        {t: "h2", text: "Tabbed Box :: ui.tabbedBox({panes: Pane[], defaultTab?:string, controls?: Element[]})"}
        ui.tabbedBox({
          defaultTab: "pane2#tabbedBox",
          panes: makeExamplePanes("tabbedBox"),
          controls: [{c: "ion-close tab", click: null}, {c: "ion-search tab", click: null}]
        }),

        {t: "h2", text: "Accordion :: ui.accordion({panes: Pane[], defaultPane?:string, horizontal?: boolean})"}
        ui.accordion({id:"example-accordion", panes: makeExamplePanes("accordion")}),

        {t: "h2", text: "Row: ui.row({})"},
        ui.row({c: "spaced-row", children: [{text: "foo"}, {text: "bar"}, {text: "baz"}]});

        {t: "h2", text: "Column: ui.column({})"},
        ui.column({children: [{text: "foo"}, {text: "bar"}, {text: "baz"}]});

        {t: "h2", text: "Dropdown: ui.dropdown({options:string[], size?:number,  multiple:boolean = false, defaultOption?: number})"},
        {text: "What is size, multiple, and defaultOption? They don't seem to be used?"},
        ui.dropdown({options: ["one","two","three"]}),
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
        ui.chart({chartData: [data1, data2], chartType: ui.ChartType.BAR}),
        ui.image({backgroundImage: "http://witheve.com/logo.png", height: "100", width: "100"}),
        ui.table({tableData: data, tableHeaders: columns}),
      ]}

      {t: "h1", text: "Dynamic Rendering"},
      {text: "The uiRenderer renders declaratively using the contents of the uiElement, uiAttribute, uiBoundElement, and uiBoundAttribute tables."},
      {text: "Add uiElements with the ids 'A' or 'B' to see rendered content."},
      {id: "ui-renderer-example", c: "group renderer", children: renderer.compile(["A", "B"])}
    ]}]};
  }

  window["drawn"].root = root;

  client.afterInit(() => {});
}
