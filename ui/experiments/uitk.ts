/// <reference path="../src/microReact.ts" />
/// <reference path="../src/api.ts" />
/// <reference path="../src/client.ts" />
/// <reference path="../src/tableEditor.ts" />
/// <reference path="../src/glossary.ts" />
/// <reference path="../src/layout.ts" />
/// <reference path="../src/uiRenderer.ts" />

module uitk {

  declare var Papa;
  declare var uuid;
  const localState = api.localState;
  const ixer = api.ixer;
  const code = api.code;
  const render = drawn.render;

  let renderer = new uiRenderer.UiRenderer(drawn.renderer);

  function initLocalstate() {}

  function dispatch(event, info, rentrant = false) {
    var diffs = [];
    var commands = [];
    var storeEvent = true;

    switch(event) {
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

  let settingsPanes:ui.Pane[] = [
    {
      id: "pane1",
      title: "Pane 1",
      content: function() {
        return {text: "This is Pane 1"}
      }
    },
    {
      id: "pane2",
      title: "Pane 2",
      content: function() {
        return {text: "This is Pane 2"}
      }
    },
    {
      id: "pane3",
      title: "Pane 3",
      content: function() {
        return {children:[{text: "This is Pane 3"},ui.button({text: "Button!"})]}
      }
    }
  ];

  function workspaceCanvas() {
    var data = [
                {name: "Corey", title: "Lead Roboticist"},
                {name: "Rob", title: "COO"},
                {name: "Chris", title: "CEO"},
                {name: "Josh", title: "Man of Distinction"},
                {name: "Jamie", title: "CTO"}
    ];

    var columns = ["name","title"];

    let data1: ui.ChartData = {label: "data1", data: [30, 200, 100, 400, 150, 250, 30]};
    let data2: ui.ChartData = {label: "data2", data: [130, 100, 140, 200, 150, 50,70]};

    console.log(renderer.compile(["A", "B", "F"]));

    return {c: "canvas", children: [
      {text: "This is just some text"},
      ui.button({text: "Button 1"}),
      ui.checkbox({change: null}),
      ui.checkbox({change: null, checked: true}),
      ui.chart({chartData: [data1,data2], chartType: ui.ChartType.BAR}),
      ui.tabbedBox({id: "settings-pane", semantic: "pane::example", defaultTab: "pane1", panes: settingsPanes, controls: [{c: "ion-close tab", click: null},{c: "ion-search tab", click: null}]}),
      ui.input({multiline: false}),
      ui.input({multiline: true}),
      ui.image({backgroundImage: "http://witheve.com/logo.png", height: "100", width: "100"}),
      ui.dropdown({options: ["one","two","three"]}),
      ui.table({tableData: data, tableHeaders: columns}),
      ui.accordion({id:"example-accordion", panes: settingsPanes}),
      {c: "renderer", children: renderer.compile(["A", "B"])}
    ]};
  }

  window["drawn"].root = root;

  client.afterInit(() => {});
}
