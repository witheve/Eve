module Ui {
  declare var CodeMirror;
   declare var c3;
   declare var d3;

  //---------------------------------------------------------
  // Types
  //---------------------------------------------------------
  type Element = MicroReact.Element;
  type Content = (() => Element)|(() => Element[])|string|Element|Element[];
  type Handler = MicroReact.Handler<Event>;
  type Renderer = (elem:Element) => Element;

  type Control = Element;

  export interface Pane {
    pane: string
    content: Content
    title: Content
  }

  export interface UiState {
    container: {[id:string]: {selected: string}}
    sort: {[id:string]: {field: string, direction: number}}
  }

  //---------------------------------------------------------
  // Utilities
  //---------------------------------------------------------
  export function inject(elem:Element, content:Content, noClone:boolean = false):Element {
    if(content === undefined) { return elem; }

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
        res = Api.clone(content);
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
    container: {},
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

  export var dispatches:{[evt:string]: (info:{}) => boolean} = {
    switchPane: ({pane, container}:{pane:string, container:string}) => {
      uiState.container[container].selected = pane;
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

  function switchPane(evt, elem) {
    dispatch("switchPane", {container: elem.container, pane: elem.pane});
    if(elem.change) elem.change(evt, elem);
  }

  //---------------------------------------------------------
  // Custom Element Compilers
  //---------------------------------------------------------
  let elementCompilers = {
    row,
    column,
    renderer,
    button,
    input,
    checkbox,
    codemirror: codeMirrorElement,
    image,
    spacer,
    chart: (elem:Ui.ChartElement) => {
      elem.pointLabels = (elem.pointLabels) ? [<any>elem.pointLabels] : elem.pointLabels;
      elem.ydata = (elem.ydata) ? [<any>elem.ydata] : [];
      elem.xdata = (elem.xdata) ? [<any>elem.xdata] : elem.xdata;
      Ui.chart(elem);
    },
    "fact-table": factTable
  };
  for(let tag in elementCompilers) {
    UiRenderer.addElementCompiler(tag, elementCompilers[tag]);
  }

  //---------------------------------------------------------
  // Containers
  //---------------------------------------------------------
  export interface TabbedBoxElement extends Element {
    container: string
    panes: Pane[]
    controls?: Control[]
    defaultPane?: string
    horizontal?: boolean

    paneChange?: Handler
  }
  export function tabbedBox(elem:TabbedBoxElement):Element {
    let {container, defaultPane, panes, controls = [], horizontal = false} = elem;
    if(panes.length < 1) { return; }
    if(!uiState.container[container]) uiState.container[container] = {selected: undefined};

    let selected = uiState.container[container].selected;
    if(selected === undefined) {
      selected = uiState.container[container].selected = (defaultPane !== undefined) ? defaultPane : panes[0].pane;
    }

    let tabs = [];
    let currentPane:Pane;
    for(let pane of panes) {
      let isSelected = (pane.pane === selected);
      if(isSelected) { currentPane = pane; }
      tabs.push(inject({c: isSelected ? "tab selected" : "tab", pane: pane.pane, container, semantic: "item::tab::" + pane.pane, click: switchPane, change: elem.paneChange}, pane.title));
    }
    elem.c = `container tabbed-box ${elem.c || ""}`;
    if(elem.c.indexOf("ui-row") !== -1) { horizontal = true; }
    else if(horizontal) { elem.c += " ui-row"; }

    elem.children = [
      {c: `tabs ${!horizontal ? "ui-row ui-spaced-row" : ""}`, children: tabs.concat(spacer()).concat(controls)},
      inject({c: "pane selected"}, currentPane.content)
    ];
    return elem;
  }

  export interface AccordionElement extends Element {
    container: string
    panes: Pane[]
    defaultPane?: string
    horizontal?: boolean

    paneChange?: Handler
  }
  export function accordion(elem:AccordionElement):Element {
    let {container, defaultPane, panes, horizontal = false} = elem;
    if(panes.length < 1) { return; }
    if(!uiState.container[container]) uiState.container[container] = {selected: undefined};

    let selected = uiState.container[container].selected;
    if(selected === undefined) {
      selected = uiState.container[container].selected = (defaultPane !== undefined) ? defaultPane : panes[0].pane;
    }

    elem.children = [];
    for(let pane of panes) {
      let isSelected = (pane.pane === selected);
      elem.children.push(inject({c: isSelected ? "tab selected" : "tab", pane: pane.pane, container, semantic: "item::tab::" + pane.pane, click: switchPane}, pane.title));
      if(isSelected) elem.children.push(inject({c: "pane selected"}, pane.content));
    }

    elem.c = `container accordion ${elem.c || ""}`;
    return elem;
  }

  export function row(elem:Element):Element {
    elem.c = `ui-row ${elem.c || ""}`;
    return elem;
  }

  export function column(elem:Element):Element {
    elem.c = `ui-column ${elem.c || ""}`;
    return elem;
  }

  interface RendererElement extends Element {
    element: string
  }
  export function renderer(elem:RendererElement):Element {
    let renderElems = elem.element;
    if(renderElems.constructor !== Array) renderElems = [renderElems];
    inject(elem, Editor.renderer.compile(renderElems));
    return elem;
  }

  interface DropdownElement extends Element {
    options: string[]|Api.Dict
    size?: number
    multiple?: boolean
    defaultOption?: string
  }
  export function dropdown(elem:DropdownElement):Element {
    let {defaultOption, options, size, multiple} = elem;
    if(options instanceof Array) {
      let opts = {};
      for(let option of <string[]>options) opts[option] = option;
      options = opts;
    }
    // Build the option elements
    let optionElements:Element[] = [];
    for(let value in options) {
      let item:Element = {t: "option", value, text: options[value]};
      if(value === defaultOption) {
        item["selected"] = true;
      }
      optionElements.push(item);
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

  export interface TableElement extends Element {
    headerControls?: Content[]
    headerClick?: MicroReact.Handler<MouseEvent>
    rowClick?: MicroReact.Handler<MouseEvent>
    cellClick?: MicroReact.Handler<MouseEvent>

    headerRenderer?: Renderer
    cellRenderer?: Renderer

    data: (any[][]|{}[])
    headers?: string[]
    heterogenous?: boolean
    skip?: number
    limit?: number

    autosort? : boolean
    sortable?: boolean
    staticHeaders?: boolean
  }

  export function table(elem:TableElement):Element {
    let {headerControls, headerClick, rowClick, cellClick, headerRenderer, cellRenderer,
      data, headers = [], heterogenous, skip = 0, limit,
      autosort = true, sortable, staticHeaders} = elem;

    let rows:any[][];
    if(elem.data[0] instanceof Array) {
      rows = <any[][]> elem.data;
      if(elem.headers && !staticHeaders) {
        headers.sort(Api.displaySort);
      }
    } else {
      if(!elem.headers) {
        if(!heterogenous) {
          headers = Object.keys(elem.data[0] || {});
        } else {
          let headerFields = {};
          for(let row of <{}[]>data) {
            for(let field in row) {
              headerFields[field] = true;
            }
          }
          headers = Object.keys(headerFields);
        }
      }

      // Get a consistent list of headers and rows.
      if(elem.headers && !staticHeaders) {
        headers.sort(Api.displaySort);
      }

      rows = [];
      for(let row of <{}[]>elem.data) {
        let entry = [];
        for(let field of headers) {
          entry.push(row[field]);
        }
        rows.push(entry);
      }
    }

    if(autosort && elem.id && uiState.sort[elem.id]) {
      let {field: sortField, direction: sortDirection} = uiState.sort[elem.id];
      let sortIx = headers.indexOf(sortField);
      if(sortIx !== -1) {
        Api.sortRows(data, sortIx, sortDirection);
      }
    }

    elem.children = [];
    let headerRow = [];
    for(let header of headers) {
      let {field: activeField, direction: dir} = uiState.sort[elem.id] || {field: undefined, direction: undefined};
      let active = (activeField === header);
      let headerElem = inject({t: "th", c: "ui-spaced-row header", click: headerClick, header, children: [
        <Element>{text: (staticHeaders ? header : Api.get.name(header))},
        (sortable ? sortToggle({"for": elem.id, field: header, direction: active ? dir : 1, active}) : undefined)
      ]}, headerControls);
      headerRow.push(headerRenderer ? headerRenderer(headerElem) : headerElem);
    }
    elem.children.push({t: "thead", children: [
      {t: "tr", c: "header-row", children: headerRow}
    ]});

    let rowIx = 0;
    let bodyRows = [];
    for(let row of rows) {
      if(skip > rowIx) {
        rowIx++;
        continue;
      }
      if(limit !== undefined && skip + limit < rowIx) {
        break;
      }
      let entryRow = [];
      let ix = 0;
      for(let cell of row) {
        let cellElem = {t: "td", c: "cell", click: elem.cellClick, header: headers[ix], text: (cell instanceof Array) ? cell.join(", ") : cell};
        entryRow.push(cellRenderer ? cellRenderer(cellElem) : cellElem);
        ix++;
      }
      bodyRows.push({t: "tr", c: "row", children: entryRow, row: rowIx, click: elem.rowClick});
      rowIx++;
    }
    elem.children.push({t: "tbody", children: bodyRows});

    elem.t = "table";
    return elem;
  }

  interface FactTable extends Element {
    view: string
  }
  export function factTable(elem:FactTable):Element {
    let facts = Api.ixer.find(elem.view);
    elem["data"] = facts;
    elem["headerClick"] = clickFieldHeader;
    if(!facts.length) elem["headers"] = Api.get.fields(elem.view);
    return table(<any>elem);
  }

  function clickFieldHeader(evt, elem) {
    let fieldId = elem.header;
    console.info(fieldId);
    console.info("* name:", Api.get.name(fieldId));
    console.info("* order:", Api.get.order(fieldId));
    console.info("* tags:", Api.get.tags(fieldId));
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
    elem.c = `ui-input ${elem.c || ""}`;
    elem.contentEditable = true;
    if(!multiline) {
      let oldKeydown = elem.keydown;
      elem.keydown = function(evt, elem) {
        let target = <HTMLElement> evt.target;
        if(evt.keyCode === Api.KEYS.ENTER) {
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
        if(target.children.length) { // contenteditable has decided to add a node instead of text for some reason. Yay.
          let text = "";
          let child:Node;
          for(child of <Array<Node>><any>target.childNodes) {
            if(child.nodeType === child.TEXT_NODE) text += child.textContent;
            else if(child.nodeName === "span") text += " " + child.textContent;
            else text += "\n" + child.textContent;
          }
          target.textContent = text;
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

  interface CMElement extends Element {
    autofocus?: boolean
    submit?: Handler
    _cmChange?: Handler
  }
  function cmPostRender(node, elem:CMElement) {
    let cm = node.editor;
    if(!cm) {
      cm = node.editor = new CodeMirror(node, {
        mode: "text",
        lineWrapping: true,
        lineNumbers: true,
        extraKeys: {
          "Cmd-Enter": () => {
            if(elem.submit) elem.submit(cm, elem);
          }
        }
      });
      if(elem._cmChange) cm.on("change", (evt) => elem._cmChange(evt, Editor.renderer.renderer.tree[elem.id]));
      if(elem.keydown) cm.on("keydown", (evt) => elem.keydown(evt, Editor.renderer.renderer.tree[elem.id]));
      if(elem.focus) cm.on("focus", (evt) => elem.focus(evt, Editor.renderer.renderer.tree[elem.id]));
      if(elem.blur) cm.on("blur", (evt) => elem.blur(evt, Editor.renderer.renderer.tree[elem.id]));
      if(elem.autofocus) cm.focus();
    }
    if(cm.getValue() !== elem.value) cm.setValue(elem.value);
  }
  export function codeMirrorElement(elem:CMElement):Element {
    elem.t = "codemirror";
    if(elem.change) {
      elem._cmChange = elem.change;
      delete elem.change;
    }
    elem.postRender = cmPostRender;
    return elem;
  }

  //---------------------------------------------------------
  // Components
  //---------------------------------------------------------
  interface ErrorElement extends Element {
    message: string
    element: Element
  }
  export function uiError(elem: ErrorElement):Element {
    elem.t = "ui-error";
    elem.c = `ui-error ${elem.c || ""}`;
    elem.text = elem.message;
    return elem;
  }

  export function image(elem:Element): Element {
    elem.c = `image ${elem.c || ""}`;
    return elem;
  }

  export function spacer(elem:Element = {}):Element {
    elem.c = `ui-spacer ${elem.c || ""}`;
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
    gaugeMin?: number
    gaugeMax?: number
    width?: number
  }
  interface ChartNode extends HTMLElement {
    chart: any
    labels: string[]
    chartType: ChartType;
  }

  export function chart(elem:ChartElement):Element {

    let {labels,ydata,xdata,pointLabels,chartType,gaugeMin,gaugeMax,width} = elem;

    elem.key = `${elem.key ? `key=${elem.key}` : ""}
                type=${chartType}
                ${labels ? `labels=[${labels.join(",")}]` : ""}
                ${pointLabels ? `pointLabels=[${pointLabels.join(",")}]` : ""}
                ${xdata ? `xs=[${xdata.join(",")}]` : ""}
                ${ydata ? `ys=[${ydata.join(",")}]` : ""}`;

    // Set the data spec based on chart type
    let chartTypeString: string;
    let dataSpec: ChartDataSpec = {};
    let linespec, areaspec, barspec, piespec, donutspec, gaugespec = {};
    let showLegend = false;
    switch(chartType) {
      case ChartType.BAR:
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        if(width !== undefined) {barspec['width'] = width;}
        chartTypeString = "bar";
        break;
      case ChartType.LINE:
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        chartTypeString = "line";
        break;
      case ChartType.SPLINE:
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        chartTypeString = "spline";
        break;
      case ChartType.AREA:
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        chartTypeString = "area";
        break;
      case ChartType.AREASPLINE:
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        chartTypeString = "area-spline";
        break;
      case ChartType.PIE:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        dataSpec.ynumeric = true;
        chartTypeString = "pie";
        showLegend = true;
        // @HACK here we take each element in ydata and turn it into its own array
        // this is to work around the fact we can't bind multiple data series yet.
        // When we can, this should be removed.
        var newydata = [];
        for(let d of ydata[0]) {
          newydata.push([d]);
        }
        if(pointLabels !== undefined) {
          labels = pointLabels[0];
          pointLabels = undefined;
        }
        ydata = newydata;
        xdata = undefined;
        break;
      case ChartType.DONUT:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        dataSpec.ynumeric = true;
        if(width !== undefined) {donutspec['width'] = width;}
        chartTypeString = "donut";
        showLegend = true;
        // @HACK here we take each element in ydata and turn it into its own array
        // this is to work around the fact we can't bind multiple data series yet.
        // When we can, this should be removed.
        var newydata = [];
        for(let d of ydata[0]) {
          newydata.push([d]);
        }
        if(pointLabels !== undefined) {
          labels = pointLabels[0];
          pointLabels = undefined;
        }
        ydata = newydata;
        xdata = undefined;
        break;
      case ChartType.SCATTER:
        dataSpec.reqx = true;
        dataSpec.xeqy = true;
        dataSpec.ynumeric = true;
        chartTypeString = "scatter";
        break;
      case ChartType.GAUGE:
        dataSpec.nox = true;
        dataSpec.singleydata = true;
        dataSpec.singledata = true;
        dataSpec.ynumeric = true;
        if(gaugeMin !== undefined) {gaugespec['min'] = gaugeMin;}
        if(gaugeMax !== undefined) {gaugespec['max'] = gaugeMax;}
        if(width !== undefined) {gaugespec['width'] = width;}
        chartTypeString = "gauge";
        break;
      default:
        throw new Error("Unknown chart type");
    }

    // If no labels are provided, we need some default labels
    if(labels === undefined) {
      labels = [];
      for(let i in ydata) {
        labels.push('data' + i);
      }
    }

    // check array lengths
    let arrayNames = ["ydata","xdata","labels","pointLabels"];
    let arrays = [ydata,xdata,labels,pointLabels];
    for(let i in arrays) {
      if(arrays[i] !== undefined && arrays[i].length != ydata.length) {
         throw new Error("ChartElement arrays must have the same number of elements. \r\n ydata has length " + ydata.length + ", but " + arrayNames[i] + " has length " + arrays[i].length);
      }
    }

    // convert input data into nice format for type checking
    let formattedData = [];
    for(let i in labels) {
      let formatted = {};
      formatted["label"] = labels[i];
      formatted["ydata"] = ydata[i];
      if(xdata !== undefined && xdata[i] !== undefined && xdata[i].length > 0) {
        formatted["xdata"] = xdata[i];
      }
      formattedData.push(formatted);
    }

    // verify data matches the format expected by the chart type
    if(!checkData(formattedData,dataSpec)) {
      throw new Error("Could not render chart");
    }

    // get the labels and data into the right format for c3
    let formattedC3Data = [];
    let xdataBindings = [];
    for(let d of formattedData) {
      let labelAndData: (string|number)[];
      if(d.ydata instanceof Array) {
        labelAndData = d.ydata.slice(0);
      } else {
        labelAndData = [d.ydata];
      }
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
          return pointLabels[j][i].toString();
        };
    }

    elem.postRender = function(node:ChartNode, elem) {

      let chartFromScratch = function() {
        return c3.generate({
          bindto: node,
          data:{
            xs: xdataBindings,
            columns:formattedC3Data,
            type: chartTypeString,
            labels: {
              format: c3PointLabels
            }
          },
          legend: {
            show: showLegend
          },
          line: linespec,
          area: areaspec,
          bar: barspec,
          pie: piespec,
          donut: donutspec,
          gauge: gaugespec,
          color: {
            pattern: ['#0079B0','#5B59A4','#59a2a4','#59a45b','#00B8F1','#4A4088','#407e88','#40884a','#009EE0','#6B67AD']
          },
          padding: {
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }
        })
      }

      if(node.chart) {
        // if the chart type changed, just do a transform
        if(node.chartType != chartType) {
          node.chart.transform(chartTypeString);
        }
        // @HACK If we are going to or from a pie/donut chart, we need to start over
        // because of the way we handle pie charts. When we can support multiple
        // line charts, this probably won't be needed
        if(node.chartType === ChartType.PIE || chartType === ChartType.PIE ||
            node.chartType === ChartType.DONUT || chartType === ChartType.DONUT ||
            node.chartType === ChartType.GAUGE || chartType === ChartType.GAUGE) {
          node.chart = chartFromScratch();
        } else {
          node.chart.load({
            xs: xdataBindings,
            columns:formattedC3Data,
            labels: {
              format: c3PointLabels
            },
            unload: node.labels
          });
        }
      } else {
        node.chart = chartFromScratch();
      }
      // Save some data in the node for comparison during a chart update
      node.labels = labels;
      node.chartType = chartType;
    };

    return elem;

  }

  interface ChartDataSpec {
    singledata?: boolean
    singleydata?: boolean
    ynumeric?: boolean
    nox?: boolean
    reqx?: boolean
    xeqy?: boolean
  }
  function checkData(chartData: any[], dataSpec: ChartDataSpec):boolean {
    if(dataSpec.singledata && chartData.length > 1) {
      throw new Error("Chart accepts only a single data series.");
    }
    for(let d of chartData) {
      if(dataSpec.ynumeric && !isNumeric(d.ydata)) {
        throw new Error("Each ydata point must be numeric.");
      }
      if(dataSpec.singleydata && d.ydata.length > 1) {
        throw new Error("Each ydata may only contain a single value. This ydata contains " + d.ydata.length + " values.");
      }
      if(dataSpec.nox && d.xdata !== undefined) {
        throw new Error("Chart cannot have xdata.");
      }
      if(dataSpec.reqx && d.xdata === undefined) {
        throw new Error("xdata required, but none supplied.");
      }
      if(dataSpec.xeqy && d.xdata !== undefined && d.ydata.length !== d.xdata.length) {
        throw new Error("xdata and ydata need to be of equal length: \r\n ydata has length " + d.ydata +  ", but xdata has length " + d.xdata);
      }
    }

    return true;
  }

  function isNumeric(testValue: any):boolean {
    let testArray = [];
    if(!(testValue instanceof Array)) {
      testArray = [testValue];
    } else {
      testArray = testValue;
    }
    for(let t of testArray) {
      if(!((t - parseFloat(t) + 1) >= 0)) {
        return false
      }
    }
    return true;
  }


  interface SearcherElement extends Element {

  }
  export function searcher(elem:SearcherElement):Element {

    return elem;
  }
}
