/// <reference path="./microReact.ts" />
module ui {
   declare var c3;
   declare var d3;

  //---------------------------------------------------------
  // Types
  //---------------------------------------------------------
  type Element = microReact.Element;
  type Content = (() => Element)|(() => Element[])|string|Element|Element[];
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
    accordion: {[id:string]: string}
    sort: {[id:string]: {field: string, direction: number}}
  }

  //---------------------------------------------------------
  // Utilities
  //---------------------------------------------------------
  function inject(elem:Element, content:Content, noClone:boolean = false):Element {
    let res:Element|Element[];
    if(typeof content === "string") {
      res = {text: content};
    } else if(typeof content === "function") {
      res = (<Function>content)();
    } else if(typeof content === "object") {
      if(noClone) {
        res = content;
      } else {
        // @NOTE: This is a slow path and should be avoided in tight loops.
        res = api.clone(content);
      }
    }

    if(!elem.children) { elem.children = []; }

    if(res instanceof Array) {
      elem.children.push.apply(elem.children, res);
    } else {
      elem.children.push(res);
    }

    return elem;
  }

  //---------------------------------------------------------
  // Dispatcher
  //---------------------------------------------------------
  export var onChange = () => undefined;
  export var uiState:UiState = {
    tabbedBox: {},
    accordion: {},
    sort: {}
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
    },
    switchAccordion: ({pane, accordion}:{pane:string, accordion:string}) => {
      uiState.accordion[accordion] = pane;
      return true;
    },
    setSort: ({forId, fieldId, direction}:{forId:string, fieldId: string, direction:number}) => {
      uiState.sort[forId] = {field: fieldId, direction};
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

  export interface AccordionElement extends Element {
    panes: Pane[]
    defaultPane?:string
    horizontal?:boolean
  }
  export function accordion(elem:AccordionElement):Element {
    let {id, defaultPane, panes = [], horizontal} = elem;
    if(panes.length < 1) { return; }
    let tabs = [];
    let currentPane;

    // manage the default selected pane if none is supplied
    let selected = uiState.accordion[id];
    if(selected === undefined) {
      selected = uiState.tabbedBox[id] = (defaultPane !== undefined) ? defaultPane : panes[0].id;
    }

    elem.c = `accordion ${elem.c || ""}`;
    elem.children = [];
    // for each pane, inject the title, and if the pane is selected its content
    for(let p of panes) {
      let isSelected = (p.id === selected);
      elem.children.push(inject({c: isSelected ? "tab selected" : "tab", accordion: id, pane: p.id, click: switchAccordion}, p.title));
      if(isSelected) { elem.children.push(inject({c: "pane"}, p.content)) };
    }
    return elem;
  }

  function switchAccordion(evt,elem) {
    dispatch("switchAccordion", {accordion: elem.accordion, pane: elem.pane});
  }

  export function row(elem:Element):Element {
    elem.c = `flex-row ${elem.c || ""}`;
    return elem;
  }

  export function column(elem:Element):Element {
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

  interface SortToggleElement extends Element {
    for: string
    field: string
    direction?: number
    active?: boolean
  }
  export function sortToggle(elem:SortToggleElement) {
    let {"for":forId, field:fieldId, direction = 1, active = false} = elem;

    var sortClass = `icon ${(direction === 1 || !active) ? "ion-android-arrow-dropdown" : "ion-android-arrow-dropup"} ${active ? "active" : ""}`;
    return {c: sortClass, click: setSort, forId, fieldId, direction};
  }
  function setSort(evt, elem) {
    dispatch("setSort", {forId: elem.forId, fieldId: elem.fieldId, direction: elem.direction === 1 ? -1 : 1});
  }

  interface TableElement extends Element {
    headerControls?: Content[]
    headerClick?: microReact.Handler<MouseEvent>
    rowClick?: microReact.Handler<MouseEvent>
    cellClick?: microReact.Handler<MouseEvent>

    data: (any[][]|{}[])
    headers?: string[]
    heterogenous?: boolean

    autosort? : boolean
    sortable?: boolean
    staticHeaders?: boolean
  }

  export function table(elem:TableElement):Element {
    // Get a consistent list of headers and rows.
    var data:any[][];
    var headers:string[] = elem.headers || [];
    if(elem.headers && !elem.staticHeaders) {
      headers.sort(api.displaySort);
    }
    if(elem.data.length === 0) {
      data = [];
    } else if(elem.data[0] instanceof Array) {
      data = <any[][]> elem.data;
    } else {
      if(!elem.headers) {
        if(!elem.heterogenous) {
          headers = Object.keys(elem.data[0]);
        } else {
          let headerFields = {};
          for(let row of <{}[]>elem.data) {
            for(let field in row) {
              headerFields[field] = true;
            }
          }
          headers = Object.keys(headerFields);
        }
        if(elem.headers && !elem.staticHeaders) {
          headers.sort(api.displaySort);
        }
      }

      data = [];
      for(let row of <{}[]>elem.data) {
        let entry = [];
        for(let field of headers) {
          entry.push(row[field]);
        }
        data.push(entry);
      }
    }

    let {autosort = true, sortable} = elem;
    if(autosort && elem.id && uiState.sort[elem.id]) {
      let {field: sortField, direction: sortDirection} = uiState.sort[elem.id];
      let sortIx = headers.indexOf(sortField);
      if(sortIx !== -1) {
        api.sortRows(data, sortIx, sortDirection);
      }
    }

    elem.children = [];
    let headerControls = elem.headerControls || [];
    let headerRow = [];
    for(let header of headers) {
      let {field: activeField, direction: dir} = uiState.sort[elem.id] || {field: undefined, direction: undefined};
      let active = (activeField === header);
      headerRow.push(
        inject({t: "th", c: "spaced-row header", click: elem.headerClick, header, children: [
          <Element>{text: (elem.staticHeaders ? header : api.code.name(header))},
          (sortable ? ui.sortToggle({"for": elem.id, field: header, direction: active ? dir : 1, active}) : undefined)
        ]}, headerControls));
    }
    elem.children.push({t: "thead", children: [
      {t: "tr", c: "header-row", children: headerRow}
    ]});

    let rowIx = 0;
    let bodyRows = [];
    for(let row of data) {
      let entryRow = [];
      let ix = 0;
      for(let cell of row) {
        entryRow.push({t: "td", c: "cell", click: elem.cellClick, header: headers[ix], text: (cell instanceof Array) ? cell.join(", ") : cell});
        ix++;
      }
      bodyRows.push({t: "tr", c: "row", children: entryRow, row: rowIx, click: elem.rowClick});
      rowIx++;
    }
    elem.children.push({t: "tbody", children: bodyRows});

    elem.t = "table";
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
  export function image(elem:Element): Element {
    elem.c = `image ${elem.c || ""}`;
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
    SCATTER,
    PIE,
    DONUT,
    GAUGE,
  }

  export interface ChartElement extends Element {
    labels?: string[]
    ydata: number[][]
    xdata?: number[][]
    pointLabels?: string[][]
    chartType: ChartType
  }

  export function chart(elem:ChartElement):Element {
    let {labels,ydata,xdata,pointLabels,chartType,line,area,bar,pie,donut,gauge,groups} = elem;
    elem.key = `${elem.key + " " || ""}${chartType}
                ${labels ? `::labels[${labels.join(",")}]` : ""}
                ${pointLabels ? `::pointLabels[${pointLabels.join(",")}]` : ""}
                ${xdata ? `::xs[${xdata.join(",")}]` : ""}
                ${ydata ? `::ys[${ydata.join(",")}]` : ""}`;

    // If no labels are provided, we need some default labels
    if(labels === undefined) {
      labels = [];
      for(let i in ydata) {
        labels.push('data' + i);
      }
    }

    // Set the data spec based on chart type
    let chartTypeString: string;
    let dataSpec: ChartDataSpec = {};
    let linespec, areaspec, barspec, piespec, donutspec, gaugespec = {};
    switch(chartType) {
      case ChartType.BAR:
        dataSpec.xeqy = true;
        chartTypeString = "bar";
        barspec = bar;
        break;
      case ChartType.LINE:
        dataSpec.xeqy = true;
        chartTypeString = "line";
        linespec = line;
        break;
      case ChartType.SPLINE:
        dataSpec.xeqy = true;
        chartTypeString = "spline";
        linespec = line;
        break;
      case ChartType.AREA:
        dataSpec.xeqy = true;
        chartTypeString = "area";
        areaspec = area;
        break;
      case ChartType.AREASPLINE:
        dataSpec.xeqy = true;
        chartTypeString = "area-spline";
        areaspec = area;
        linespec = line;
        break;
      case ChartType.PIE:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        chartTypeString = "pie";
        piespec = pie;
        break;
      case ChartType.DONUT:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        chartTypeString = "donut";
        donutspec = donut;
        break;
      case ChartType.SCATTER:
        dataSpec.reqx = true;
        dataSpec.xeqy = true;
        chartTypeString = "scatter";
        break;
      case ChartType.GAUGE:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        dataSpec.singledata = true;
        chartTypeString = "gauge";
        gaugespec = gauge;
        break;
      default:
        throw new Error("Undefined chart type");
    }

    // check array lengths
    let formattedData = [];
   if(!(ydata.length === labels.length &&
         (xdata === undefined || ydata.length === xdata.length) &&
         (pointLabels === undefined || ydata.length === pointLabels.length)
      )) {
        throw new Error("ChartElement arrays must have the same number of elements");
   }

    // convert input data into nice format for type checking
    let formatedData = [];
    for(let i in labels) {
      let formatted = {};
      formatted["label"] = labels[i];
      formatted["ydata"] = ydata[i];
      if(xdata !== undefined && xdata[i].length > 0) {
        formatted["xdata"] = xdata[i];
      }
      formattedData.push(formatted);
    }

    // verify data matches the format expected by the chart type
    if(!checkData(formattedData,dataSpec)) {
      throw new Error("Could not render chart: " + elem);
    }

    // get the labels and data into the right format for c3
    let formattedC3Data = [];
    let xdataBindings = [];
    for(let d of formattedData) {
      let labelAndData: (string|number)[] = d.ydata.slice(0);
      labelAndData.unshift(d.label);
      formattedC3Data.push(labelAndData);
      if(d.xdata !== undefined) {
        let labelAndData: (string|number)[] = d.xdata.slice(0);
        let xlabel = d.label + "_x";
        labelAndData.unshift(xlabel);
        formattedC3Data.push(labelAndData);
        xdataBindings[d.label] = xlabel;
      }
    }

    let c3PointLabels = {};
    if(pointLabels !== undefined) {
      c3PointLabels =
        function(v,id,i,j) {
          if(id === undefined) {
            return;
          }
          return pointLabels[j][i];
        };
    }

    elem.postRender = api.debounce(200,function(chartNode,elem) {
      if(chartNode.chart) {
        chartNode.chart.load({
          xs: xdataBindings,
          columns:formattedC3Data,
          type: chartTypeString,
          groups: groups,
          labels: {
            format: c3PointLabels
          },
          unload: chartNode.chart.columns
        });
      } else {
        chartNode.chart = c3.generate({
          bindto: chartNode,
          data:{
            xs: xdataBindings,
            columns:formattedC3Data,
            type: chartTypeString,
            groups: groups,
            labels: {
              format: c3PointLabels
            }
          },
          line: linespec,
          area: areaspec,
          bar: barspec,
          pie: piespec,
          donut: donutspec,
          gauge: gaugespec,
        })
      }
    });

    return elem;
  }

  interface ChartDataSpec {
    singledata?: boolean
    singleydata?: boolean
    nox?: boolean
    reqx?: boolean
    xeqy?: boolean
  }
  function checkData(chartData: any[], dataSpec: ChartDataSpec):boolean {
    if(dataSpec.singledata && chartData.length > 1) {
      throw new Error("Chart accepts only a single chartData element.");
    }
    for(let d of chartData) {
      if(dataSpec.singleydata && d.ydata.length !== 1) {
        throw new Error("Chart accepts only a single ydata per chartData element");
      }
      if(dataSpec.nox && d.xdata !== undefined) {
        throw new Error("Chart cannot have xdata.");
      }
      if(dataSpec.reqx && d.xdata === undefined) {
        throw new Error("xdata required");
      }
      if(dataSpec.xeqy && d.xdata !== undefined && d.ydata.length !== d.xdata.length) {
        throw new Error("xdata and ydata need to be equal length");
      }
    }

    return true;
  }


}
