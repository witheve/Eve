var Ui;
(function (Ui) {
    //---------------------------------------------------------
    // Utilities
    //---------------------------------------------------------
    function inject(elem, content, noClone) {
        if (noClone === void 0) { noClone = false; }
        if (content === undefined) {
            return elem;
        }
        var res;
        if (typeof content === "string") {
            res = { text: content };
        }
        else if (typeof content === "function") {
            res = content();
        }
        else if (typeof content === "object") {
            if (noClone) {
                res = content;
            }
            else {
                // @NOTE: This is a slow path and should be avoided in tight loops.
                res = Api.clone(content);
            }
        }
        if (!elem.children) {
            elem.children = [];
        }
        if (res instanceof Array) {
            elem.children.push.apply(elem.children, res);
        }
        else {
            elem.children.push(res);
        }
        return elem;
    }
    Ui.inject = inject;
    //---------------------------------------------------------
    // Dispatcher
    //---------------------------------------------------------
    Ui.onChange = function () { return undefined; };
    Ui.uiState = {
        tabbedBox: {},
        accordion: {},
        sort: {}
    };
    function init(localState, changeHandler) {
        Ui.onChange = changeHandler;
        if (!localState.uiState) {
            localState.uiState = Ui.uiState;
        }
        else {
            Ui.uiState = localState.uiState;
        }
    }
    Ui.init = init;
    var dispatches = {
        switchTab: function (_a) {
            var tab = _a.tab, tabbedBox = _a.tabbedBox;
            Ui.uiState.tabbedBox[tabbedBox] = tab;
            return true;
        },
        switchAccordion: function (_a) {
            var pane = _a.pane, accordion = _a.accordion;
            Ui.uiState.accordion[accordion] = pane;
            return true;
        },
        setSort: function (_a) {
            var forId = _a.forId, fieldId = _a.fieldId, direction = _a.direction;
            Ui.uiState.sort[forId] = { field: fieldId, direction: direction };
            return true;
        }
    };
    function dispatch(evt, info) {
        if (!dispatches[evt]) {
            console.error("Unknown dispatch:", event, info);
            return;
        }
        else {
            var changed = dispatches[evt](info);
            if (changed) {
                Ui.onChange();
            }
        }
    }
    Ui.dispatch = dispatch;
    function tabbedBox(elem) {
        var id = elem.id, defaultTab = elem.defaultTab, _a = elem.panes, panes = _a === void 0 ? [] : _a, _b = elem.controls, controls = _b === void 0 ? [] : _b;
        if (panes.length < 1) {
            return;
        }
        var tabs = [];
        var currentPane;
        var selected = Ui.uiState.tabbedBox[id];
        if (selected === undefined) {
            selected = Ui.uiState.tabbedBox[id] = (defaultTab !== undefined) ? defaultTab : panes[0].id;
        }
        for (var _i = 0; _i < panes.length; _i++) {
            var pane = panes[_i];
            var isSelected = (pane.id === selected);
            tabs.push(inject({ c: isSelected ? "tab selected" : "tab", tab: pane.id, tabbedBox: id, semantic: "item::tab::" + pane.id, click: switchTab }, pane.title));
            if (isSelected) {
                currentPane = pane;
            }
        }
        elem.c = "tabbed-box " + (elem.c || "");
        elem.children = [
            { c: "tabs", children: tabs.concat(spacer()).concat(controls) },
            inject({ c: "pane" }, currentPane.content)
        ];
        return elem;
    }
    Ui.tabbedBox = tabbedBox;
    function switchTab(evt, elem) {
        dispatch("switchTab", { tabbedBox: elem.tabbedBox, tab: elem.tab });
    }
    function accordion(elem) {
        var id = elem.id, defaultPane = elem.defaultPane, _a = elem.panes, panes = _a === void 0 ? [] : _a, horizontal = elem.horizontal;
        if (panes.length < 1) {
            return;
        }
        var tabs = [];
        var currentPane;
        // manage the default selected pane if none is supplied
        var selected = Ui.uiState.accordion[id];
        if (selected === undefined) {
            selected = Ui.uiState.tabbedBox[id] = (defaultPane !== undefined) ? defaultPane : panes[0].id;
        }
        elem.c = "accordion " + (elem.c || "");
        elem.children = [];
        // for each pane, inject the title, and if the pane is selected its content
        for (var _i = 0; _i < panes.length; _i++) {
            var p = panes[_i];
            var isSelected = (p.id === selected);
            elem.children.push(inject({ c: isSelected ? "tab selected" : "tab", accordion: id, pane: p.id, click: switchAccordion }, p.title));
            elem.children.push(inject({ c: isSelected ? "pane selected" : "pane" }, p.content));
        }
        return elem;
    }
    Ui.accordion = accordion;
    function switchAccordion(evt, elem) {
        dispatch("switchAccordion", { accordion: elem.accordion, pane: elem.pane });
    }
    function row(elem) {
        elem.c = "flex-row " + (elem.c || "");
        return elem;
    }
    Ui.row = row;
    function column(elem) {
        elem.c = "flex-column " + (elem.c || "");
        return elem;
    }
    Ui.column = column;
    function dropdown(elem) {
        var defaultOption = elem.defaultOption, options = elem.options, size = elem.size, multiple = elem.multiple;
        // Build the option elements
        var optionElements = [];
        for (var _i = 0; _i < options.length; _i++) {
            var option = options[_i];
            var item = { t: "option", value: option, text: option };
            if (option === defaultOption) {
                item["selected"] = true;
            }
            optionElements.push(item);
        }
        elem.c = (elem.c) ? "dropdown " + elem.c : "dropdown";
        elem.t = "select";
        elem.children = optionElements;
        return elem;
    }
    Ui.dropdown = dropdown;
    function sortToggle(elem) {
        var forId = elem["for"], fieldId = elem.field, _a = elem.direction, direction = _a === void 0 ? 1 : _a, _b = elem.active, active = _b === void 0 ? false : _b;
        var sortClass = "icon " + ((direction === 1 || !active) ? "ion-android-arrow-dropdown" : "ion-android-arrow-dropup") + " " + (active ? "active" : "");
        return { c: sortClass, click: setSort, forId: forId, fieldId: fieldId, direction: direction };
    }
    Ui.sortToggle = sortToggle;
    function setSort(evt, elem) {
        dispatch("setSort", { forId: elem.forId, fieldId: elem.fieldId, direction: elem.direction === 1 ? -1 : 1 });
    }
    function table(elem) {
        var headerControls = elem.headerControls, headerClick = elem.headerClick, rowClick = elem.rowClick, cellClick = elem.cellClick, headerRenderer = elem.headerRenderer, cellRenderer = elem.cellRenderer, data = elem.data, _a = elem.headers, headers = _a === void 0 ? [] : _a, heterogenous = elem.heterogenous, _b = elem.skip, skip = _b === void 0 ? 0 : _b, limit = elem.limit, _c = elem.autosort, autosort = _c === void 0 ? true : _c, sortable = elem.sortable, staticHeaders = elem.staticHeaders;
        var rows;
        if (elem.data[0] instanceof Array) {
            rows = elem.data;
            if (elem.headers && !staticHeaders) {
                headers.sort(Api.displaySort);
            }
        }
        else {
            if (!elem.headers) {
                if (!heterogenous) {
                    headers = Object.keys(elem.data[0]);
                }
                else {
                    var headerFields = {};
                    for (var _i = 0, _d = data; _i < _d.length; _i++) {
                        var row_1 = _d[_i];
                        for (var field in row_1) {
                            headerFields[field] = true;
                        }
                    }
                    headers = Object.keys(headerFields);
                }
            }
            // Get a consistent list of headers and rows.
            if (elem.headers && !staticHeaders) {
                headers.sort(Api.displaySort);
            }
            rows = [];
            for (var _e = 0, _f = elem.data; _e < _f.length; _e++) {
                var row_2 = _f[_e];
                var entry = [];
                for (var _g = 0; _g < headers.length; _g++) {
                    var field = headers[_g];
                    entry.push(row_2[field]);
                }
                rows.push(entry);
            }
        }
        if (autosort && elem.id && Ui.uiState.sort[elem.id]) {
            var _h = Ui.uiState.sort[elem.id], sortField = _h.field, sortDirection = _h.direction;
            var sortIx = headers.indexOf(sortField);
            if (sortIx !== -1) {
                Api.sortRows(data, sortIx, sortDirection);
            }
        }
        elem.children = [];
        var headerRow = [];
        for (var _j = 0; _j < headers.length; _j++) {
            var header = headers[_j];
            var _k = Ui.uiState.sort[elem.id] || { field: undefined, direction: undefined }, activeField = _k.field, dir = _k.direction;
            var active = (activeField === header);
            var headerElem = inject({ t: "th", c: "spaced-row header", click: headerClick, header: header, children: [
                    { text: (staticHeaders ? header : Api.code.name(header)) },
                    (sortable ? sortToggle({ "for": elem.id, field: header, direction: active ? dir : 1, active: active }) : undefined)
                ] }, headerControls);
            headerRow.push(headerRenderer ? headerRenderer(headerElem) : headerElem);
        }
        elem.children.push({ t: "thead", children: [
                { t: "tr", c: "header-row", children: headerRow }
            ] });
        var rowIx = 0;
        var bodyRows = [];
        for (var _l = 0; _l < rows.length; _l++) {
            var row_3 = rows[_l];
            if (skip > rowIx) {
                rowIx++;
                continue;
            }
            if (limit !== undefined && skip + limit < rowIx) {
                break;
            }
            var entryRow = [];
            var ix = 0;
            for (var _m = 0; _m < row_3.length; _m++) {
                var cell = row_3[_m];
                var cellElem = { t: "td", c: "cell", click: elem.cellClick, header: headers[ix], text: (cell instanceof Array) ? cell.join(", ") : cell };
                entryRow.push(cellRenderer ? cellRenderer(cellElem) : cellElem);
                ix++;
            }
            bodyRows.push({ t: "tr", c: "row", children: entryRow, row: rowIx, click: elem.rowClick });
            rowIx++;
        }
        elem.children.push({ t: "tbody", children: bodyRows });
        elem.t = "table";
        return elem;
    }
    Ui.table = table;
    function factTable(elem) {
        var facts = Api.ixer.facts(elem.view, true);
        elem["data"] = facts;
        return table(elem);
    }
    Ui.factTable = factTable;
    //---------------------------------------------------------
    // Inputs
    //---------------------------------------------------------
    function button(elem) {
        elem.c = "button " + (elem.c || "");
        elem.t = "button";
        return elem;
    }
    Ui.button = button;
    function input(elem) {
        var multiline = elem.multiline, _a = elem.normalize, normalize = _a === void 0 ? true : _a;
        if (!elem.placeholder) {
            elem.placeholder === " ";
        }
        elem.c = "input " + (elem.c || "");
        elem.contentEditable = true;
        if (!multiline) {
            var oldKeydown = elem.keydown;
            elem.keydown = function (evt, elem) {
                var target = evt.target;
                if (evt.keyCode === Api.KEYS.ENTER) {
                    evt.preventDefault();
                    target.blur();
                }
                else if (oldKeydown) {
                    oldKeydown(evt, elem);
                }
            };
        }
        if (normalize) {
            var oldKeyup = elem.keyup;
            elem.keyup = function (evt, elem) {
                var target = evt.target;
                if (target.textContent === "") {
                    target.innerHTML = "";
                }
                if (oldKeyup) {
                    oldKeyup(evt, elem);
                }
            };
        }
        return elem;
    }
    Ui.input = input;
    function checkbox(elem) {
        elem.c = "checkbox " + (elem.c || "");
        elem.t = "input";
        elem.type = "checkbox";
        elem.checked = (elem.checked) ? elem.checked : false;
        return elem;
    }
    Ui.checkbox = checkbox;
    function uiError(elem) {
        elem.t = "ui-error";
        elem.c = "ui-error " + (elem.c || "");
        elem.text = elem.message;
        return elem;
    }
    Ui.uiError = uiError;
    function image(elem) {
        elem.c = "image " + (elem.c || "");
        return elem;
    }
    Ui.image = image;
    function spacer(elem) {
        if (elem === void 0) { elem = {}; }
        elem.c = "flex-spacer " + (elem.c || "");
        return elem;
    }
    Ui.spacer = spacer;
    (function (ChartType) {
        ChartType[ChartType["BAR"] = 0] = "BAR";
        ChartType[ChartType["LINE"] = 1] = "LINE";
        ChartType[ChartType["SPLINE"] = 2] = "SPLINE";
        ChartType[ChartType["AREA"] = 3] = "AREA";
        ChartType[ChartType["AREASPLINE"] = 4] = "AREASPLINE";
        ChartType[ChartType["SCATTER"] = 5] = "SCATTER";
        ChartType[ChartType["PIE"] = 6] = "PIE";
        ChartType[ChartType["DONUT"] = 7] = "DONUT";
        ChartType[ChartType["GAUGE"] = 8] = "GAUGE";
    })(Ui.ChartType || (Ui.ChartType = {}));
    var ChartType = Ui.ChartType;
    function chart(elem) {
        var labels = elem.labels, ydata = elem.ydata, xdata = elem.xdata, pointLabels = elem.pointLabels, chartType = elem.chartType, gaugeMin = elem.gaugeMin, gaugeMax = elem.gaugeMax, width = elem.width;
        elem.key = (elem.key ? "key=" + elem.key : "") + "\n                type=" + chartType + "\n                " + (labels ? "labels=[" + labels.join(",") + "]" : "") + "\n                " + (pointLabels ? "pointLabels=[" + pointLabels.join(",") + "]" : "") + "\n                " + (xdata ? "xs=[" + xdata.join(",") + "]" : "") + "\n                " + (ydata ? "ys=[" + ydata.join(",") + "]" : "");
        // Set the data spec based on chart type
        var chartTypeString;
        var dataSpec = {};
        var linespec, areaspec, barspec, piespec, donutspec, gaugespec = {};
        var showLegend = false;
        switch (chartType) {
            case ChartType.BAR:
                dataSpec.xeqy = true;
                dataSpec.ynumeric = true;
                if (width !== undefined) {
                    barspec['width'] = width;
                }
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
                for (var _i = 0, _a = ydata[0]; _i < _a.length; _i++) {
                    var d = _a[_i];
                    newydata.push([d]);
                }
                if (pointLabels !== undefined) {
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
                if (width !== undefined) {
                    donutspec['width'] = width;
                }
                chartTypeString = "donut";
                showLegend = true;
                // @HACK here we take each element in ydata and turn it into its own array
                // this is to work around the fact we can't bind multiple data series yet.
                // When we can, this should be removed.
                var newydata = [];
                for (var _b = 0, _c = ydata[0]; _b < _c.length; _b++) {
                    var d = _c[_b];
                    newydata.push([d]);
                }
                if (pointLabels !== undefined) {
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
                if (gaugeMin !== undefined) {
                    gaugespec['min'] = gaugeMin;
                }
                if (gaugeMax !== undefined) {
                    gaugespec['max'] = gaugeMax;
                }
                if (width !== undefined) {
                    gaugespec['width'] = width;
                }
                chartTypeString = "gauge";
                break;
            default:
                throw new Error("Unknown chart type");
        }
        // If no labels are provided, we need some default labels
        if (labels === undefined) {
            labels = [];
            for (var i in ydata) {
                labels.push('data' + i);
            }
        }
        // check array lengths
        var arrayNames = ["ydata", "xdata", "labels", "pointLabels"];
        var arrays = [ydata, xdata, labels, pointLabels];
        for (var i in arrays) {
            if (arrays[i] !== undefined && arrays[i].length != ydata.length) {
                throw new Error("ChartElement arrays must have the same number of elements. \r\n ydata has length " + ydata.length + ", but " + arrayNames[i] + " has length " + arrays[i].length);
            }
        }
        // convert input data into nice format for type checking
        var formattedData = [];
        for (var i in labels) {
            var formatted = {};
            formatted["label"] = labels[i];
            formatted["ydata"] = ydata[i];
            if (xdata !== undefined && xdata[i] !== undefined && xdata[i].length > 0) {
                formatted["xdata"] = xdata[i];
            }
            formattedData.push(formatted);
        }
        // verify data matches the format expected by the chart type
        if (!checkData(formattedData, dataSpec)) {
            throw new Error("Could not render chart");
        }
        // get the labels and data into the right format for c3
        var formattedC3Data = [];
        var xdataBindings = [];
        for (var _d = 0; _d < formattedData.length; _d++) {
            var d = formattedData[_d];
            var labelAndData = void 0;
            if (d.ydata instanceof Array) {
                labelAndData = d.ydata.slice(0);
            }
            else {
                labelAndData = [d.ydata];
            }
            labelAndData.unshift(d.label);
            formattedC3Data.push(labelAndData);
            if (d.xdata !== undefined) {
                var labelAndData_1 = d.xdata.slice(0);
                var xlabel = d.label + "_x";
                labelAndData_1.unshift(xlabel);
                formattedC3Data.push(labelAndData_1);
                xdataBindings[d.label] = xlabel;
            }
        }
        var c3PointLabels = {};
        if (pointLabels !== undefined) {
            c3PointLabels =
                function (v, id, i, j) {
                    if (id === undefined) {
                        return;
                    }
                    return pointLabels[j][i].toString();
                };
        }
        elem.postRender = function (node, elem) {
            var chartFromScratch = function () {
                return c3.generate({
                    bindto: node,
                    data: {
                        xs: xdataBindings,
                        columns: formattedC3Data,
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
                        pattern: ['#0079B0', '#5B59A4', '#59a2a4', '#59a45b', '#00B8F1', '#4A4088', '#407e88', '#40884a', '#009EE0', '#6B67AD']
                    },
                    padding: {
                        top: 20,
                        right: 20,
                        bottom: 20,
                        left: 20
                    }
                });
            };
            if (node.chart) {
                // if the chart type changed, just do a transform
                if (node.chartType != chartType) {
                    node.chart.transform(chartTypeString);
                }
                // @HACK If we are going to or from a pie/donut chart, we need to start over
                // because of the way we handle pie charts. When we can support multiple
                // line charts, this probably won't be needed
                if (node.chartType === ChartType.PIE || chartType === ChartType.PIE ||
                    node.chartType === ChartType.DONUT || chartType === ChartType.DONUT ||
                    node.chartType === ChartType.GAUGE || chartType === ChartType.GAUGE) {
                    node.chart = chartFromScratch();
                }
                else {
                    node.chart.load({
                        xs: xdataBindings,
                        columns: formattedC3Data,
                        labels: {
                            format: c3PointLabels
                        },
                        unload: node.labels
                    });
                }
            }
            else {
                node.chart = chartFromScratch();
            }
            // Save some data in the node for comparison during a chart update
            node.labels = labels;
            node.chartType = chartType;
        };
        return elem;
    }
    Ui.chart = chart;
    function checkData(chartData, dataSpec) {
        if (dataSpec.singledata && chartData.length > 1) {
            throw new Error("Chart accepts only a single data series.");
        }
        for (var _i = 0; _i < chartData.length; _i++) {
            var d = chartData[_i];
            if (dataSpec.ynumeric && !isNumeric(d.ydata)) {
                throw new Error("Each ydata point must be numeric.");
            }
            if (dataSpec.singleydata && d.ydata.length > 1) {
                throw new Error("Each ydata may only contain a single value. This ydata contains " + d.ydata.length + " values.");
            }
            if (dataSpec.nox && d.xdata !== undefined) {
                throw new Error("Chart cannot have xdata.");
            }
            if (dataSpec.reqx && d.xdata === undefined) {
                throw new Error("xdata required, but none supplied.");
            }
            if (dataSpec.xeqy && d.xdata !== undefined && d.ydata.length !== d.xdata.length) {
                throw new Error("xdata and ydata need to be of equal length: \r\n ydata has length " + d.ydata + ", but xdata has length " + d.xdata);
            }
        }
        return true;
    }
    function isNumeric(testValue) {
        var testArray = [];
        if (!(testValue instanceof Array)) {
            testArray = [testValue];
        }
        else {
            testArray = testValue;
        }
        for (var _i = 0; _i < testArray.length; _i++) {
            var t = testArray[_i];
            if (!((t - parseFloat(t) + 1) >= 0)) {
                return false;
            }
        }
        return true;
    }
    function searcher(elem) {
        return elem;
    }
    Ui.searcher = searcher;
})(Ui || (Ui = {}));
//# sourceMappingURL=ui.js.map