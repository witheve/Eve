/// <reference path="./microReact.ts" />
module ui {
   declare var c3;
   declare var d3;

  //---------------------------------------------------------
  // Types
  //---------------------------------------------------------
  type Element = microReact.Element;
  type Content = (() => Element)|string;
  type Handler = microReact.Handler<Event>;

  export interface ElemOpts {
    c?:string
    semantic?:string
    key?:string
    debug?:string
  }

  type Control = Element;

  export interface Pane {
    title:Content
    id:string
    content:Content
  }

  export interface UiState {
    tabbedBox: {[id:string]: string}
  }

  //---------------------------------------------------------
  // Utilities
  //---------------------------------------------------------
  function inject(elem:Element, content:Content):Element {
    if(typeof content === "string") {
      elem.text = content;
    } else if(typeof content === "function") {
      elem.children = [content()];
    }
    return elem;
  }

  //---------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------
  export var onChange = () => undefined;
  export var uiState:UiState = {
    tabbedBox: {}
  };

  export function init(localState:any, changeHandler:() => void) {
    onChange = changeHandler;
    if(!localState.uiState) {
      localState.uiState = uiState;
    } else {
      uiState = localState.uiState;
    }
  }

  var dispatches:{[evt:string]: (info:{}) => boolean} = {
    switchTab: ({tab, tabbedBox}:{tab:string, tabbedBox:string}) => {
      uiState.tabbedBox[tabbedBox] = tab;
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

  //---------------------------------------------------------
  // Containers
  //---------------------------------------------------------
  export interface TabbedBoxElement extends Element {
    panes: Pane[]
    controls?:Control[]
    defaultTab?:string
  }
  export function tabbedBox(elem:TabbedBoxElement):Element {
    let {id, defaultTab, panes = [], controls = []} = elem;
    if(panes.length < 1) { return; }
    let tabs = [];
    let currentPane;
    let selected = uiState.tabbedBox[id];
    if(selected === undefined) {
      selected = uiState.tabbedBox[id] = (defaultTab !== undefined) ? defaultTab : panes[0].id;
    }

    for(let pane of panes) {
      let isSelected = (pane.id === selected);
      tabs.push(inject({c: isSelected ? "tab selected" : "tab", tab: pane.id, tabbedBox: id, semantic: "item::tab::" + pane.id, click: switchTab}, pane.title));
      if(isSelected) {
        currentPane = pane;
      }
    }
    elem.c = `tabbed-box ${elem.c || ""}`;
    elem.children = [
      {c: "tabs", children: tabs.concat(ui.spacer()).concat(controls)},
      inject({c: "pane"}, currentPane.content)
    ];
    return elem;
  }

  function switchTab(evt, elem) {
    dispatch("switchTab", {tabbedBox: elem.tabbedBox, tab: elem.tab});
  }

  export function horizontal(elem:Element):Element {
    elem.c = `flex-row ${elem.c || ""}`;
    return elem;
  }

  export function vertical(elem:Element):Element {
    elem.c = `flex-column ${elem.c || ""}`;
    return elem;
  }

  interface DropdownElement extends Element {
    options: string[]
    size?: number
    multiple?: boolean
    defaultOption?: number
  }
  export function dropdown(elem:DropdownElement):Element {
    let {defaultOption, options, size, multiple} = elem;

    // Build the option elements
    let optionElements:Element[] = [];
    for(let option of options) {
      optionElements.push({t: "option", value: option, text: option});
    }
    elem.c = (elem.c) ? "dropdown " + elem.c : "dropdown";
    elem.t = "select";
    elem.children = optionElements;
    return elem;
  }

  interface TableElement extends Element {
    tableHeaders: string[]
    tableData: any[]
  }
  export function table(elem:TableElement):Element {
    let {tableData:data = [], tableHeaders:columns = []} = elem;

    elem.postRender = function(tableNode,elem) {

      // create table elements
      let table = d3.select(tableNode).append("table"),
          tableHead = table.append("thead"),
          tableBody = table.append("tbody");


      // create the table header
      tableHead.append("tr")
               .selectAll("th")
               .data(columns)
               .enter()
               .append("th")
               .text(function(column) { return column; });

      // create a table row for each row in the data
      var rows = tableBody.selectAll("tr")
                          .data(data)
                          .enter()
                          .append("tr");

      // create cells in each row
      var cells = rows.selectAll("td")
                      .data(function(row) {
                          return columns.map(function(column) {
                              return {column: column, value: row[column]};
                          });
                      })
                      .enter()
                      .append("td")
                      .text(function(d) { return d.value; });
    }

    return elem;
  }

  //---------------------------------------------------------
  // Inputs
  //---------------------------------------------------------
  export function button(elem:Element):Element {
    elem.c = `button ${elem.c || ""}`;
    elem.t = "button";
    return elem;
  }

  interface TextInputElement extends Element {
    multiline?:boolean
    normalize?:boolean
  }
  export function input(elem:TextInputElement) {
    let {multiline, normalize = true} = elem;
    if(!elem.placeholder) { elem.placeholder === " "; }
    elem.c = `input ${elem.c || ""}`;
    elem.contentEditable = true;
    if(!multiline) {
      let oldKeydown = elem.keydown;
      elem.keydown = function(evt, elem) {
        let target = <HTMLElement> evt.target;
        if(evt.keyCode === api.KEYS.ENTER) {
          evt.preventDefault();
          target.blur();
        } else if(oldKeydown) {
          oldKeydown(evt, elem);
        }
      };
    }
    if(normalize) {
      let oldKeyup = elem.keyup;
      elem.keyup = function(evt, elem) {
        let target = <HTMLElement> evt.target;
        if(target.textContent === "") {
          target.innerHTML = "";
        }
        if(oldKeyup) {
          oldKeyup(evt, elem);
        }
      }
    }

    return elem;
  }

  export function checkbox(elem:Element):Element {
    elem.c = `checkbox ${elem.c || ""}`;
    elem.t = "input";
    elem.type = "checkbox";
    elem.checked = (elem.checked) ? elem.checked : false;
    return elem;
  }

  //---------------------------------------------------------
  // Components
  //---------------------------------------------------------
  export function image(elem: Element): Element {
    elem.c = (elem.c) ? "image " + elem.c : "image";
    return elem;
  }

  export function spacer(elem:Element = {}):Element {
    elem.c = `flex-spacer ${elem.c || ""}`;
    return elem;
  }

  export enum ChartType {
    BAR,
    LINE,
    SPLINE,
    AREA,
    AREASPLINE,
  }

  interface ChartElement extends Element {
    chartData: [(string|number)]
    chartType: ChartType
  }
  export function chart(elem:Element):Element {
    let {chartData,chartType} = elem;

    let chartTypeString: string;
    switch(chartType) {
      case ui.ChartType.BAR:
        chartTypeString = "bar";
        break;
      case ui.ChartType.LINE:
        chartTypeString = "line";
        break;
      case ui.ChartType.SPLINE:
        chartTypeString = "spline";
        break;
      case ui.ChartType.AREA:
        chartTypeString = "area";
        break;
      case ui.ChartType.AREASPLINE:
        chartTypeString = "area-spline";
        break;
      default:
        console.log("unrecognized chart type");
        chartTypeString = "line";
    }

    elem.postRender = function(chartNode,elem) {
      let chart = c3.generate({
        bindto: chartNode,
        data:{
          columns:[],
          type: chartTypeString,
        },
      });
      chart.load({columns:chartData})
    }

    return elem;
  }


}