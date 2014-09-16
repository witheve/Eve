var comps = eve.components = {};
var mix = eve.mixins = {};
var data = eve.data = {tree: {elements: []}, selection: {}, undo: {stack:{children: []}},
                       menu: {items: [], active: false, pos: {}},
                       page: "rules",
                       selector: {open: {}, selected: false},
                       activeRule: "foo",
                       globalId: 0,
                       rules: { },
                       tables: {"users": {name: "users",
                                          id: "users",
                                          fields: [{name: "id", id: "users_id"}, {name: "name", id: "users_name"}, {name: "email", id: "users_email"}, {name: "phone", id: "users_phone"}]},
                                "ui_elems": {name: "elems",
                                          id: "ui_elems",
                                          fields: [{name: "id", id: "elem_id"}, {name: "type", id: "elem_type"}]},
                                "ui_text": {name: "ui text",
                                            id: "ui_text",
                                            fields: [{name: "id", id: "text_id"}, {name: "text", id: "text_text"}]},
                                "ui_child": {name: "ui children",
                                             id: "ui_child",
                                             fields: [{name: "parent", id: "child_id"}, {name: "position", id: "child_position"}, {name: "child", id: "child_childid"}]},
                                "ui_events": {name: "ui events",
                                             id: "ui_events",
                                             fields: [{name: "elem", id: "events_elem_id"}, {name: "event", id: "events_event"}, {name: "label", id: "events_label"}, {name: "key", id: "events_key"}]},
                                "external_events": {name: "external_events",
                                             id: "external_events",
                                             fields: [{name: "elem", id: "extevents_elem_id"}, {name: "label", id: "extevents_label"}, {name: "key", id: "extevents_key"}, {name: "event id", id: "extevents_event_id"}]},
                                "edges": {name: "edges",
                                          id: "edges",
                                          fields: [{name: "from", id: "edges_from"}, {name: "to", id: "edges_to"}]},
                                "path": {name: "path",
                                         id: "path",
                                         fields: [{name: "from", id: "path_from"}, {name: "to", id: "path_to"}]},
                                "todos": {name: "todos",
                                          id: "todos",
                                          fields: [{name: "id", id: "todos_id"}, {name: "text", id: "todos_text"}, {name: "completed", id: "todos_completed"}]},
                                "email outbox": {name: "email outbox",
                                                 id: "email outbox",
                                                 fields: [{name: "id", id: "email outbox_id"}, {name: "to", id: "email outbox_to"}, {name: "from", id: "email outbox_from"}, {name: "subject", id: "email outbox_subject"}, {name: "body", id: "email outbox_body"}]},
                                "sms outbox": {name: "sms outbox",
                                               id: "sms outbox",
                                               fields: [{name: "id", id: "sms outbox_id"}, {name: "phone", id: "sms outbox_phone"}, {name: "message", id: "sms outbox_message"}]},
                                "sms_to_send": {name: "sms to send",
                                                id: "sms_to_send",
                                                fields: [{name: "id", id: "sms_to_send_id"}, {name: "phone", id: "sms_to_send_phone"}, {name: "message", id: "sms_to_send_message"}]},
                                "sms_pending": {name: "sms pending",
                                                id: "sms_pending",
                                                fields: [{name: "id", id: "sms pending_id"}]},
                                "email inbox": {name: "email inbox",
                                                id: "email inbox",
                                                fields: [{name: "id", id: "email inbox_id"}, {name: "to", id: "email inbox_to"}, {name: "from", id: "email inbox_from"}, {name: "subject", id: "email inbox_subject"}, {name: "body", id: "email inbox_body"}]},
                                "web_requests": {name: "web requests",
                                               id: "web_requests",
                                               fields: [{name: "id", id: "web_requests_id"}, {name: "url", id: "web_requests_url"}]},
                                "web_response": {name: "web responses",
                                               id: "web_response",
                                               fields: [{name: "response id", id: "web_response_id"}, {name: "request id", id: "web_response_request_id"}, {name: "content", id: "web_response"}]},
                                "valve": {name: "Eve valve",
                                          id: "valve",
                                          fields: [{name: "id", id: "valve_id"}, {name: "rule", id: "valve_rule"}, {name: "ix", id: "valve_ix"}]
                                         },
                                "pipe": {name: "Eve pipe",
                                          id: "pipe",
                                         fields: [{name: "id", id: "pipe_id"}, {name: "table", id: "pipe_table"}, {name: "rule", id: "pipe_rule"}, {name: "direction", id: "pipe_direction"}]
                                         },
                                "tableConstraint": {name: "Eve table constraint",
                                          id: "tableConstraint",
                                         fields: [{name: "valve", id: "tc_valve"}, {name: "pipe", id: "tc_pipe"}, {name: "field", id: "tc_field"}]
                                         },
                                "constantConstraint": {name: "Eve constant constraint",
                                          id: "constantConstraint",
                                         fields: [{name: "valve", id: "cc_valve"}, {name: "value", id: "cc_value"}]
                                         },
                                "function": {name: "Eve function",
                                          id: "function",
                                         fields: [{name: "id", id: "function_id"}, {name: "code", id: "function_code"}, {name: "valve", id: "function_valve"}, {name: "rule", id: "function_rule"}]
                                         },
                                "functionInput": {name: "Eve function input",
                                          id: "functionInput",
                                         fields: [{name: "valve", id: "functionInput_valve"}, {name: "function", id: "functionInput_function"}]
                                         },
                               },

                      };
var d = React.DOM;

if(localStorage["eve_rules"]) {
  data.rules = JSON.parse(localStorage["eve_rules"]);
  data.globalId = JSON.parse(localStorage["eve_globalId"]);
}

var dirty = function(recompile) {
  localStorage["eve_rules"] = JSON.stringify(data.rules);
  localStorage["eve_globalId"] = data.globalId;
  if(recompile && !eve.recompile) {
    eve.recompile = true;
    data.system = uiBuildSystem();
    eve.recompile = false;
  }
  if(!eve.dirty) {
    eve.dirty = true;
    window.requestAnimationFrame(eve.start);
  }
}


comps.gridHeader = React.createClass({
  render: function() {
    var props = this.props;
    var cur = this.props.column;
    return d.div({draggable: "true",
                  style: {width: "130px"},
                 onClick: function(e) {
                   var name = prompt("name: ", cur.name);
                   cur.name = name;
                   dirty();
                 },
                 onDragStart: function(e) {
                   data.selection = {action: "move column",
                                     column: cur};
                 },
                 onDragOver: function(e) {
                   e.preventDefault();
                 },
                 onDrop: function(e) {
                   //TODO: this logic probably doesn't really belong here.
                   //TODO: this is not undoable
                   data.dropZone = "";
                   var valve = data.selection.column.id;
                   if(!valve) return;

                   if(props.table) {
                     data.rules[data.activeRule].links.push({valve: valve, type: "tableConstraint", table: props.table, field: props.column.id})
                     dirty(true);
                   } else {
                     var col = data.selection.column;
                     var rule = data.rules[data.activeRule];
                     var cols = rule.valves;
                     for(var ix = 0; ix < cols.length; ix++) {
                       if(cols[ix].id == col.id) {
                         break;
                       }
                     }
                     var table, field;
                     cols.splice(ix, 1);
                     rule.links = rule.links.filter(function(cur) {
                       if(cur.valve == col.id && cur.type == "tableConstraint") {
                         table = cur.table;
                         field = cur.field;
                       }
                       return cur.valve != col.id;
                     });
                     data.rules[data.activeRule].joins.push({valve: props.column.id, table: table, field: field})
                     dirty(true);
                   }
                   e.stopPropagation();
                 }
                },
                    cur.name);
  }
});

comps.grid = React.createClass({
  createSetFunctionCB: function(rule, fn) {
    return function() {
      var result = prompt("function:", fn.userCode || fn.code);
      setFunctionCode(rule, fn, result);
      dirty(true);
    }
  },
  render: function() {
    if(!this.props.table.fields.length) return d.table();

    var rule = getActiveRule();
    var ths = [];
    var thfilters = [];
    var headers = this.props.table.fields;
    var headersLen = headers.length;
    var mods = this.props.table.joins;
    var fns = [];
    for(var i in headers) {
      var cur = headers[i];
      var fn = false;
      if(rule) {
        fn = getFunctionForValve(rule, cur.id);
      }
      if(fn) {
        fns.push(this.createSetFunctionCB(rule, fn));
      } else {
        fns.push(null);
      }
      ths.push(comps.gridHeader({column: cur, table: this.props.sinkId}));
      if(mods && mods[cur.id]) {
        thfilters.push(d.div({className: "modifier", style: {width: "130px;"}}, "merged " + mods[cur.id]));
      } else {
        thfilters.push(d.div({className: "empty", style: {width:"130px"}}));
      }
    }

    var trs = [];
    var rows = this.props.table.rows;
    if(!rows || !rows.length) {
      rows = [["", "", "", "", ""]];
    }
    var skip = this.props.table.withoutTable ? 0 : 1;
    var rowLen = rows.length;
    for(var i = 0; i < rowLen; i++) {
      var row = rows[i];
      var tds = [];
      for(var header = 0; header < headersLen; header++) {
        tds.push(d.div({onClick: fns[header], style: {width: "130px"}}, row[header + skip]));
      }
      if(this.props.table.add) {
        tds.push(d.div({className:  "add-column",
                       onClick: function() {
                         var rule = getActiveRule();
                         var valve = addValveToRule(rule, "calculated" + data.globalId++);
                         addFunctionToValve(rule, valve, "5");
                         dirty(true);
                       }}));
      }
      trs.push(d.div({className: "grid-row"}, tds));
    }

    if(this.props.table.add) {
        ths.push(d.div({className: "add-column"}, "+"));
    }

    return d.div({className: "grid"},
                 d.div({className: "grid-header-containter"},
                       d.div({className: "grid-header-filters"}, thfilters),
                       d.div({className: "grid-headers"}, ths)),
                 d.div({className: "grid-body"}, trs));
  }
});

comps.inputColumnList = React.createClass({
  render: function() {
    var table = this.props.table;
    var items = table.fields.map(function(cur) {
      return d.li({draggable: true,
                   onDragStart: function(e) {
                     data.selection = {};
                     data.selection.action = "add column";
                     data.selection.column = {tableName: table.name, table: table.id, column: cur.id, name: cur.name};
                     data.selector.selected = table.id;
                     e.dataTransfer.effectAllowed = "move";
                     e.dataTransfer.dropEffect = "move";
                     e.stopPropagation();
                   }},
                  cur.name);
    })
    return d.ul({className: "column-list"}, items);
  }
});

comps.dataSelectorItem = React.createClass({
  render: function() {
    var cur = this.props.table;
    var active = data.selector.open[cur.id];
    var items = [d.span({className: "selector-toggle " + (active ? "ion-ios7-arrow-down" : "ion-ios7-arrow-right"),
                         onClick: function() {
                            data.selector.open[cur.id] = !active;
                         }}),
                 d.span({className: "table-name"}, cur.name)];
    if(data.selector.open[cur.id]) {
      items.push(comps.inputColumnList({table: cur, id: this.props.id}));
    }
    return d.li({className: "" + (data.selector.open[cur.id] ? "active" : "") + (data.selector.selected === cur.id ? " selected" : ""),
                 draggable: true,
                 onDragStart: function(e) {
                     data.selection = {};
                     data.selection.action = "add table";
                     data.selection.table = cur;
                     data.selector.selected = cur.id;
                     e.dataTransfer.effectAllowed = "move";
                     e.dataTransfer.dropEffect = "move";
                 },
                 onDoubleClick: function() {
                    data.page = "table-view";
                    data.activeRule = cur.id;
                    dirty();
                 },
                 onClick: function() {
                    data.selector.selected = cur.id;
                   dirty();
                 },
                 onBlur: function() {
                   cur.active = false;
                   dirty();
                 }},
                items);
  }
});

comps.dataSelector = React.createClass({
  render: function() {

    var items = [];
    var tables = data.tables;
    for(var i in tables) {
      var cur = tables[i];
      items.push(comps.dataSelectorItem({table: cur}));
    }

    return d.div({className: "data-selector container"},
                 d.ul({className: "data-selector-tables"}, items));
  }
});

comps.workspace = React.createClass({

  render: function() {
    var rule = this.props.rule;
    var valves = {};

//     var ins = {};
//     var outs = {};
//     rule.pipes.forEach(function(cur) {
//       if(cur.type == "+source") {
//         ins[cur.id] = cur.table;
//       } else {
//         outs[cur.id] = cur.table;
//       }
//     });

//     rule.valves.forEach(function(cur) {
//       valves[cur.id] = {name: cur.name,
//                         in: [],
//                         out: [],
//                         joins: [],
//                         functions: []};
//     });

//     rule.links.forEach(function(cur) {
//       var valve = valves[cur.valve];
//       if(ins[cur.table]) {
//         valve.in.push({table: ins[cur.table], field: cur.field})
//       }
//       if(outs[cur.table]) {
//         valve.out.push({table: outs[cur.table], field: cur.field})
//       }
//     });

//     rule.joins.forEach(function(cur) {
//       var valve = valves[cur.valve];
//       valve.joins.push(cur);
//     });

//     rule.functions.forEach(function(cur) {
//       var valve = valves[cur.valve];
//       valve.functions.push(cur);
//     });


//     var final = [];

//     for(var i in valves) {
//       var cur = valves[i];
//       var source = cur.in[0];
//       var items = [];
// //       if(!cur.functions.length && !cur.joins.length) {
// //         items.push(d.li({className: "out"}, d.span({className: "ref"}, cur.name)));
// //       }
//       cur.functions.forEach(function(func) {
//         items.push(d.li({}, d.span({className: "ref"}, cur.name), d.span({className: "func"}, " = " + (func.userCode || func.code))));
//       });
//       cur.joins.forEach(function(join) {
//         items.push(d.li({}, d.span({className: "ref"}, (source ? columnToName(rule, source) : cur.name)), d.span({className: "merge"}, "merge") , d.span({className: "ref"}, "" + columnToName(rule, join))));
//       });
//       final.push(d.ul({}, items));
//     }

    return d.div({className: "workspace" + (data.dropZone === "workspace" ? " dropping" : ""),
                  onDragLeave: this.onDragLeave,
                  onDragOver: this.onDragOver,
                  onDrop: this.onDrop},
                 d.svg({width: "100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                       d.path({className: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5"})
                      )
                 //final
//                   d.div({className: "vbox"}, "workspace"
//                         d.div({className: "workspace"},
//                               comps.grid({table: {fields: cols,
//                                                   joins: joinMap,
//                                                   filters: filterMap,
//                                                   add: true,
//                                                   withoutTable: true,
//                                                   //TODO: show the real intermediates
//                                                   rows: this.getIntermediates()}}
//                                         )))
                       );
  }
});

comps.workspaceGrid = React.createClass({
    addColumn: function(col, ix) {
    var cols = this.props.rule.valves;
    for(var i in cols) {
      if(cols[i].table == col.table && cols[i].name == col.name) {
        return;
      }
    }
    var pipe = findPipeForTable(this.props.rule, col.table);
    if(!pipe) {
        //TODO: how does negation fit into this?
        pipe = {id: "pipe" + data.globalId++, table: col.table, type: "+source"};
        this.props.rule.pipes.push(pipe);

    }
    var valveId = "valve" + data.globalId++;
    var valve = {id: valveId, name: col.tableName + "." + col.name};
    this.props.rule.links.push({type: "tableConstraint", valve: valveId, table: pipe.id, field: col.column});
    if(ix === undefined) {
      cols.push(valve);
      return cols.length - 1;
    } else {
      cols.splice(ix,0,valve);
      return ix;
    }
  },
  removeColumn: function(col) {
    var cols = this.props.rule.valves;
    var ix = cols.indexOf(col);
    cols.splice(ix, 1);
    this.props.rule.links = this.props.rule.links.filter(function(cur) {
      return cur.valve != col.id;
    });
    return ix;
  },
  onDrop: function(e) {
    var self = this;
    var action = data.selection.action;
    data.dropZone = false;
    if(action == "add column") {
      var col = data.selection.column;
      var ix = this.addColumn(col);
      if(ix !== undefined) {
        undoEntry({description: "add column",
                   undo: function(ent) {
                     self.removeColumn(col);
                   },
                   redo: function(ent) {
                     self.addColumn(col,ix);
                   }});
        dirty(true);
      }
    } else if(action == "move column") {
      var col = data.selection.column;
      var ix = this.removeColumn(col);
      //FIXME: links are lost.
      undoEntry({description: "remove column",
                 undo: function(ent) {
                   self.addColumn(col,ix);
                 },
                 redo: function(ent) {
                   self.removeColumn(col);
                 }});
      dirty(true);
    } else if(action == "add table") {
      var table = data.selection.table;
      table.fields.forEach(function(cur) {
        self.addColumn({tableName: table.name, table: table.id, column: cur.id, name: cur.name});
      });
      dirty(true);
    }
  },
  onDragOver: function(e) {
    e.preventDefault();
    if(data.selection.action.indexOf("add") < 0) return;
    data.dropZone = "workspace";
    dirty();
  },

  onDragLeave: function(e) {
    data.dropZone = false;
    dirty();
  },

  getIntermediates: function() {
    var dump = dumpMemory(data.system.memory);
    try {
      var flow = compileRule(dump, data.activeRule);
      var outputAdds = [];
      flow.source.update(data.system.memory, outputAdds, []);
      return outputAdds;
    } catch (e) {
      return [];
    }
  },

  render: function() {
    var rule = this.props.rule;
    var cols = rule.valves;
    var joins = rule.joins;
    var filters = rule.joins;
    var joinMap = {};
    var filterMap = {};

    for(var i in joins) {
      var cur = joins[i];
      joinMap[cur.valve] = columnToName(rule, cur);
    }

    for(var i in filters) {
      var cur = filters[i];
      filterMap[cur.valve] = cur;
    }

    return d.div({className: "workspaceGrid",
                  onDragLeave: this.onDragLeave,
                  onDragOver: this.onDragOver,
                  onDrop: this.onDrop},
                 comps.grid({table: {fields: cols,
                                     joins: joinMap,
                                     filters: filterMap,
                                     add: true,
                                     withoutTable: true,
                                     //TODO: show the real intermediates
                                     rows: this.getIntermediates()}}
                           )
                );
  }
});

comps.header = React.createClass({
  render: function() {
    var rule = this.props.rule;
    return d.header({className: "header hbox"},
                    d.span({className: "ion-grid return-to-grid",
                            onClick: function(e) {
                              data.page = "rules";
                              dirty();
                            }
                           }),
                    d.input({className: "description", type: "text", value: rule.description, onChange: function(e) {
                      rule.description = e.target.value;
                      dirty();
                    }}))
  }
});

comps.ioSelectorItem = React.createClass({
  render: function() {
    var props = this.props;
    return d.li({className: "",
                 onClick: function() {
                   data.rules[data.activeRule].pipes.push({id: "pipe" + data.globalId++, table: props.table.id, type: props.type});
                   data[props.type.substring(1) + "Selector"] = "closed";
                   dirty(true);
                 }},
                props.table.name);
  }
});

comps.ioSelector = React.createClass({
  render: function() {
    var type = this.props.type;
    var selector = type + "Selector";
    if(!data[selector] || data[selector] == "closed") {
      return d.li({className: "ion-ios7-plus-empty add-button add-" + type + " " + type + "-selector",
                   onClick: function() {
                     data[selector] = "open";
                     dirty(true);
                   }});
    }

    var items = [];
    for(var i in data.tables) {
      items.push(comps.ioSelectorItem({table: data.tables[i], type: "+" + type}));
    }

    return d.li({className: type + "-selector"},
                d.ul({className: ""}, items));
  }
});

comps.ioItem = React.createClass({
  render: function() {
    var table = this.props.table;
    var rule = getActiveRule();
    var fields = [];
    for(var i in table.fields) {
      var cur = table.fields[i];
      fields.push(d.li({}, cur.name));
    }
    var items = [];
    var links = this.props.links;
    if(links) {
      var linksMap = {};
      var linkItems = [];
      for(var i in links) {
        console.log(JSON.stringify(links[i]));
        console.log(JSON.stringify(rule.valves));
        linksMap[links[i].field] = valveToName(rule, links[i].valve);
      }
      console.log(linksMap);
      for(var i in table.fields) {
        var cur = table.fields[i];
        if(linksMap[cur.id]) {
          linkItems.push(d.li({},
                              d.svg({width: "20px", height:"25px", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                    d.path({className: "arrow", d:"m10,0 l-10,10 l10,10", strokeWidth:"0.5"})
                                   ),
                              d.span({}, linksMap[cur.id])));
        } else {
          linkItems.push(d.li({className: "empty"},
                              d.svg({width: "20px", height:"25px", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                    d.path({className: "arrow", d:"m10,0 l-10,10 l10,10", strokeWidth:"0.5"})
                                   ),
                              d.span({}, " ")));
        }
      }
      items.push(d.ul({className: "ioLinks"}, linkItems));
    }
    if(!this.props.reverse) {
      return d.div({className: "ioItem"}, d.h2({}, table.name), d.ul({}, fields), items);
    } else {
      return d.div({className: "ioItem reversed"}, items, d.ul({}, fields), d.h2({}, table.name));
    }
  }
});

comps.sources = React.createClass({
  render: function() {
    var items = [];
    var sources = this.props.sources;
    for(var i in sources) {
      var cur = data.tables[sources[i].table];
      items.push(comps.ioItem({table: cur}));
    }
    return d.div({className: "sources"}, d.div({className: "vbox"},  items));
  }
});

comps.sinks = React.createClass({
  getSolutions: function() {
    var dump = dumpMemory(data.system.memory);
    var flow = compileRule(dump, data.activeRule);
    var output = flow.update(data.system.memory, Memory.empty())
    var final = {};
    output.facts.forEach(function(cur) {
      var table = cur[0];
      if(!final[table]) {
        final[table] = [];
      }
      final[table].push(cur);
    });
    return final;
  },

  onDragOver: function(e) {
    data.dropZone = "sinks";
    dirty();
    e.preventDefault();
  },

  onDragLeave: function(e) {
    data.dropZone = "";
    dirty();
  },

  onDrop: function(e) {
    data.dropZone = "";
    dirty();
    if(data.selection.action === "add table") {
      var table = data.selection.table;
      data.rules[data.activeRule].pipes.push({id: "pipe" + data.globalId++, table: table.id, type: "+sink"});
      dirty(true);
    }
  },

  render: function() {

    var items = [];
    var sinks = this.props.sinks;
    var rule = getActiveRule();
    var sols = this.getSolutions();
    for(var i in sinks) {
      var cur = data.tables[sinks[i].table];
      //TODO: get the values for the sinks
//       items.push(d.li({}, d.h2({}, cur.name), comps.grid({table: {fields: cur.fields, rows: sols[sinks[i].table]}, sinkId: sinks[i].id})));
      items.push(comps.ioItem({table: cur, links: findLinksForPipe(rule, sinks[i].id)}));
    }

    items.push(d.li({className: "uiWatcher"}, data.uiWatcherResults));

    return d.div({className: "sinks" + (data.dropZone === "sinks" ? " dropping" : ""),
        onDragOver: this.onDragOver,
        onDragLeave: this.onDragLeave,
        onDrop: this.onDrop},
                 d.div({className: "vbox"}, items));
  }
});

comps.details = React.createClass({
  render: function() {
    return d.div({className: "details"}, comps.workspaceGrid({rule: data.rules[data.activeRule]}));
  }
});

comps.ruleItem = React.createClass({
  render: function() {
    var props = this.props;
    var ins = [];
    var outs = [];
    props.rule.pipes.forEach(function(cur) {
      var li = d.li({}, data.tables[cur.table].name);
      if(cur.type == "+source") {
        ins.push(li);
      } else {
        outs.push(li);
      }
    });
    return d.div({className: "rule",
                  onClick: function(e) {
                    if(!e.altKey) {
                      data.activeRule = props.id;
                      data.page = "data";
                      dirty();
                    } else {
                      delete data.rules[props.id];
                      dirty(true);
                    }
                  },
                  onContextMenu: function(e) {
                    data.menu.pos = {x: e.clientX, y: e.clientY};
                    data.menu.active = true;
                    data.menu.items = [{label: "remove"}];
                    e.preventDefault();
                    dirty();
                  }
                 },
//                  d.div({className: "vbox"},
//                        d.h2({}, this.props.rule.description),
//                        d.div({className: "hbox"},
//                              d.ul({}, ins),
//                              d.ul({}, outs)))

                 d.div({className: "vbox"},
                       d.h2({}, this.props.rule.description),
                       d.table({},
                               d.thead({}),
                               d.tbody({},
                                       d.td({className: "ins"}, d.ul({}, ins)),
                                       d.td({className: "between"},
                                            //<path d="m10,0 l-10,10 l10,10" stroke-width="0.5" stroke="#333" fill="#775"/></svg>
                                            d.svg({width: "100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                                  d.path({className: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5", stroke: "red"})
                                                 )),
                                       d.td({className: "outs"}, d.ul({}, outs)))))

                );
  }
});

comps.rulesList = React.createClass({
  render: function() {
    var items = [];
    var rs = this.props.rules;
    for(var i in rs) {
      var cur = rs[i];
      items.push(comps.ruleItem({id: i, rule: cur}));
    }
    return d.div({className: "rules"}, items,
                                  d.div({className: "vbox rule add-rule",
                                         onClick: function() {
                                           var rule = "unnamed" + data.globalId++;
                                           data.rules[rule] = ({pipes: [], valves: [], joins: [], sorts: [], groups: [], functions: [], links: [], description: "unnamed"});
                                           data.page = "data";
                                           data.activeRule = rule;
                                           dirty(true);
                                         }},
                       d.h2({}, "new rule"),
                       d.table({},
                               d.thead({}),
                               d.tbody({},
                                       d.td({className: "ins"}, d.ul({})),
                                       d.td({className: "between"},
                                            d.svg({width: "100%", height:"100%", viewBox: "0 0 10 20", preserveAspectRatio: "none"},
                                                  d.path({className: "arrow", d:"m0,0 l10,10 l-10,10", strokeWidth:"0.5", stroke: "red"})
                                                 )),
                                       d.td({className: "outs"}, d.ul({}))))));
  }
});

comps.tableItem = React.createClass({
  render: function() {
    var props = this.props.table;
    return d.div({className: "rule",
                        onClick: function() {
                          data.activeRule = props.id;
                          data.page = "table-view";
                          dirty();
                        }},
                 d.div({className: "vbox"},
                       d.h2({}, this.props.table.name))
                );
  }
});

comps.tablesList = React.createClass({
  render: function () {
    var items = [];
    var tables = this.props.tables;
    for(var i in tables) {
      var cur = tables[i];
      items.push(comps.tableItem({id: i, table: cur}));
    }
    return d.div({className: "tables"}, items);
  }
});

comps.tableView = React.createClass({
  render: function() {
    //TODO: replace with table API call
    var rows = data.system.memory.getTable(this.props.table.id);
    return d.div({className: "table-view"}, d.h2({}, this.props.table.name), comps.grid({table: {fields: this.props.table.fields, rows: rows}}), d.span({className: "ion-grid return-to-grid",
                         onClick: function(e) {
                           data.page = "rules";
                           dirty();
                         }
                        }));
  }
});

comps.linksList = React.createClass({
  render: function() {
    var rule = data.rules[data.activeRule];
    var links = rule.links;
    var valves = rule.valves;
    var valveToName = {};
    for(var i in valves) {
      valveToName[valves[i].id] = valves[i].name;
    }
    var pipes = rule.pipes;
    var pipesToName = {};
    for(var i in pipes) {
      pipesToName[pipes[i].id] = pipes[i].table;
    }
    var items = [];
    for(var i in links) {
      var cur = links[i];
      items.push(d.li({}, valveToName[cur.valve] + " -> " + cur.field + " [" + cur.table + "]" ));
    }
    return d.ul({className: "links-list"}, items);
  }
});

comps.menu = React.createClass({
  render: function() {
    var items = [];
    var curItems = data.menu.items;
    for(var i in curItems) {
      var cur = curItems[i];
      items.push(d.div({}, cur.label));
    }
    console.log(data.menu);
    return d.div({className: "menu-shade" + (data.menu.active ? " active" : ""),
                  onClick: function(e) {
                    data.menu.active = false;
                    dirty();
                  }},
                 d.div({className: "menu",
                        style: {top: data.menu.pos.y, left: data.menu.pos.x}},
                       items));
  }
});

comps.wrapper = React.createClass({

  render: function() {

    var cur = [comps.menu()];

    switch(data.page) {

      case "ui":
        cur.push(comps.toolbox(), comps.undoList(), comps.uiCanvas({node: data.tree}));
        break;

      case "data":
        var activeRule = {rule: data.rules[data.activeRule]};
        var ins = [];
        var outs = [];
        activeRule.rule.pipes.forEach(function(cur) {
          if(cur.type == "+source") {
            ins.push(cur);
          } else {
            outs.push(cur);
          }
        });
        cur.push(d.div({className: "vbox"},
                       comps.header(activeRule),
                       d.div({className: "hbox data-top"}, comps.sources({sources: ins}), comps.workspace(activeRule), comps.sinks({sinks: outs})),
                       comps.details()
        ));
        break;


      case "rules":
        cur.push(d.div({className: "hbox"}, comps.dataSelector(), comps.rulesList({rules: data.rules})));
        break;

      case "table-view":
        var table = data.tables[data.activeRule];
        var ruleIds = rulesRelatedToTable(table.id);
        var rules = {};
        for(var i in ruleIds) {
            rules[ruleIds[i]] = data.rules[ruleIds[i]];
        }
        cur.push(d.div({className: "hbox table-view-container"}, comps.dataSelector(), d.div({className: "hbox"}, comps.rulesList({rules: rules}), comps.tableView({table: table}))));
        break;

    }

    return d.div({id: "wrapper"},
//                  comps.toolbar(),
                 cur
                );
  }
});

//*********************************************************
// Rule rep utilities
//*********************************************************

var findField = function(table, id) {
  for(var i in table.fields) {
    if(table.fields[i].id === id) {
      return table.fields[i];
    }
  }
}

var findLinksForPipe = function(rule, pipe) {
  return rule.links.filter(function(cur) {
    return cur.table === pipe;
  });
}

var findPipeForTable = function(rule, table) {
    for(var i in rule.pipes) {
        var cur = rule.pipes[i];
        if(cur.table === table) return cur;
    }
    return false;
}

var pipeToTable = function(rule, pipeId) {
  for(var i in rule.pipes) {
    if(rule.pipes[i].id === pipeId) {
      return data.tables[rule.pipes[i].table];
    }
  }
}

var valveToName = function(rule, valve) {
  for(var i in rule.valves) {
    var cur = rule.valves[i];
    if(valve === cur.id) return cur.name;
  }
}

var columnToName = function(rule, col) {
  var table = data.tables[col.table] || pipeToTable(rule, col.table);
  var column = findField(table, col.field);
  return table.name + "." + column.name;
}

var rulesRelatedToTable = function(table) {
  var rules = data.rules;
  var final = [];
  for(var i in rules) {
    if(findPipeForTable(rules[i], table)) {
        final.push(i);
    }
  }
  return final;
}

var getActiveRule = function() {
  return data.rules[data.activeRule];
}

var addValveToRule = function(rule, name, ix) {
  var cols = rule.valves;
  var valveId = "valve" + data.globalId++;
  var valve = {id: valveId, name: name};
  if(ix === undefined) {
    cols.push(valve);
  } else {
    cols.splice(ix,0,valve);
  }
  return valveId;
}

var addFunctionToValve = function(rule, valve, code) {
  var funcId = "function" + data.globalId++;
  var func = {id: funcId, code: code, valve: valve, args: []};
  rule.functions.push(func);
  return funcId;
}

var getFunctionForValve = function(rule, valve) {
  for(var i in rule.functions) {
    var cur = rule.functions[i];
    if(cur.valve === valve) {
      return cur;
    }
  }
  return false;
}

var setFunctionCode = function(rule, func, code) {
  var valves = rule.valves;
  var parts = code.split(/[\s]/);
  var args = [];
  var final = [];
  for(var i in parts) {
    var cur = parts[i];
    var found = false;
    for(var i in valves) {
      var valve = valves[i];
      if(cur === valve.name) {
        found = true;
        args.push({valve: valve.id});
        final.push(valve.id);
        break;
      }
    }
    if(!found) final.push(cur);
  }
  func.userCode = code;
  func.code = final.join(" ");
  func.args = args;
  return func;
}

//*********************************************************
// Build
//*********************************************************

var updateQueue = [];
var isQueued = false;

var uiCompileRule = function(rule, ruleId) {
  var facts = [];
  var added = {};
  rule.pipes.forEach(function(cur) {
    facts.push(["pipe", cur.id, cur.table, ruleId, cur.type]);
  });
  rule.links.forEach(function(cur) {
    facts.push([cur.type, cur.valve, cur.table, cur.field]);
  });
  rule.joins.forEach(function(cur) {
    facts.push(["tableConstraint", cur.valve, cur.table, cur.field]);
  });
  rule.valves.forEach(function(cur, ix) {
    facts.push(["valve", cur.id, ruleId, ix]);
  });
  rule.functions.forEach(function(cur) {
    facts.push(["function", cur.id, cur.code, cur.valve, ruleId]);
    for(var i in cur.args) {
      var arg = cur.args[i];
      facts.push(["functionInput", arg.valve, cur.id]);
    }
  });
  return facts;
}

var updateSystem = function(things) {
  data.system.update(things, []);
  //WATCHERS GO HERE
  smsWatcher(data.system.memory);
  webWatcher(data.system.memory);
  dirty();
}

var uiBuildSystem = function() {
  var rules = data.rules;
  var final = [];
  for(var rule in rules) {
    var facts = this.uiCompileRule(rules[rule], rule);
    var factsLen = facts.length;
    for(var i = 0; i < factsLen; i++) {
      final.push(facts[i]);
    }
  }
  var tables = data.tables;
  for(var table in tables) {
    var cur = tables[table];
    cur.fields.forEach(function(field, ix) {
      final.push(["schema", table, field.id, ix]);
    });
  }
  var prev = [];
  if(data.system) {
    prev = data.system.memory.getTable("external_events");
  }
  var system = compileSystem(Memory.fromFacts(compilerSchema.concat(final).concat(prev)));
  try {
  system.update([["users", 0, "chris", "chris@chris.com", "555-555-5555"],
                 ["users", 1, "jamie", "jamie@jamie.com", "555-555-5555"],
                 ["users", 2, "rob", "rob", "555-555-5555"],
                 ["edges", "a", "b"],
                 ["edges", "b", "c"],
                 ["edges", "c", "d"],
                 ["edges", "d", "e"],
                 ["edges", "e", "f"],
                 ["edges", "d", "b"]
                ],
                []);
  } catch(e) {
    console.error(e);
  }
  return system;
}


//*********************************************************
// Watchers
//*********************************************************

var createUICallback = function(id, label, key) {
  return function(e) {
    updateSystem([["external_events", id, label, key, data.globalId++]]);
  };
}

var uiWatcher = function(memory) {
  var elem = memory.getTable("ui_elems");
  var text = memory.getTable("ui_text");
  var attrs = memory.getTable("ui_attrs");
  var styles = memory.getTable("ui_styles");
  var events = memory.getTable("ui_events");
  var children = memory.getTable("ui_child");

  var elem_id = 1;
  var elem_type = 2;

  var text_text = 2;

  var attrs_attr = 2;
  var attrs_value = 3;

  var styles_attr = 2;
  var styles_value = 3;

  var events_event = 2;
  var events_label = 3;
  var events_key = 4;

  var child_childid = 3;

  var builtEls = {};
  var roots = {};

  var elemsLen = elem.length;
  for(var i = 0; i < elemsLen; i++) {
    var cur = elem[i];
    roots[cur[elem_id]] = true;
    if(React.DOM[cur[elem_type]]) {
      builtEls[cur[elem_id]] = React.DOM[cur[elem_type]]();
    } else {
      builtEls[cur[elem_id]] = React.DOM.p();
    }
  }

  var textLen = text.length;
  for(var i = 0; i < textLen; i++) {
    var cur = text[i];
    builtEls[cur[elem_id]] = cur[text_text];
  }

  var attrsLen = attrs.length;
  for(var i = 0; i < attrsLen; i++) {
    var cur = attrs[i];
    builtEls[cur[elem_id]].props[cur[attrs_attr]] = cur[attrs_value];
  }

  var stylesLen = styles.length;
  for(var i = 0; i < stylesLen; i++) {
    var cur = styles[i];
    if(!builtEls[cur[attrs_id]].props.styles) {
      builtEls[cur[attrs_id]].props.styles = {};
    }
    builtEls[cur[elem_id]].props.styles[cur[styles_attr]] = cur[styles_value];
  }

  var eventsLen = events.length;
  for(var i = 0; i < eventsLen; i++) {
    var cur = events[i];
    builtEls[cur[elem_id]].props[cur[events_event]] = createUICallback(cur[elem_id], cur[events_label], cur[events_key]);
  }

  var childrenLen = children.length;
  children.sort();
  for(var i = 0; i < childrenLen; i++) {
    var cur = children[i];
    var child = builtEls[cur[child_childid]];
    delete roots[cur[child_childid]];
    if(!builtEls[cur[elem_id]].props.children) {
      builtEls[cur[elem_id]].props.children = [];
    }
    builtEls[cur[elem_id]].props.children.push(child);
  }

  var final = d.div();
  final.props.children = [];
  for(var i in roots) {
    final.props.children.push(builtEls[i]);
  }

  data.uiWatcherResults = final;
}

var lastSeenSMSID = 0;

var smsWatcher = function(memory) {
  var sms = memory.getTable("sms outbox");
  var sent = [];
  for(var i in sms) {
    var cur = sms[i];
    if(cur[1] > lastSeenSMSID) {
      $.post("http://localhost:3000/text", {to: cur[2], body: cur[3]});
      console.log("Send text: ", cur[2], cur[3]);
      sent.push(["sms_pending", cur[1]]);
      lastSeenSMSID = cur[1];
    }
  }
  if(sent.length > 0) {
    data.system.update(sent, []);
  }
}

var lastSeenWebRequestID = 0;

var webWatcher = function(memory) {
  var requests = memory.getTable("web_requests");
  var sent = [];
  for(var i in requests) {
    var cur = requests[i];
    if(cur[1] > lastSeenWebRequestID) {
      $.get(cur[2], function(resp) {
        updateSystem([["web_response", data.globalId++, cur[1], resp]]);
      });
      console.log("Get page ", cur[2]);
      sent.push(["web_pending", cur[1]]);
      lastSeenWebRequestID = cur[1];
    }
  }
  if(sent.length > 0) {
    data.system.update(sent, []);
  }

}

//*********************************************************
//Key Handling
//*********************************************************

var keys = {backspace: 8,
            shift: 16,
            enter: 13,
            left: 37,
            up: 38,
            right: 39,
            down: 40,
            c: 67,
            v: 86,
            z: 90};

document.addEventListener("keydown", function(e) {
  var handled = false;
  var shift = e.shiftKey;
  switch(e.keyCode) {
    case keys.backspace:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        var entry = uiUndoEntry("remove selected elements");
        entry.undo = function(ent) {
          var sels = ent.selections;
          for(var i in sels) {
            data.tree.elements.push(sels[i]);
          }
          setSelections(ent.selections);
        };
        entry.redo = function(ent) {
          data.tree.elements = data.tree.elements.filter(function(cur) {
            return ent.selections.indexOf(cur) === -1;
          });
          clearSelections();
        };
        entry.redo(entry);
      }
      break;

    case keys.left:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.left -= shift ? 10 : 1;
        })
      }
      break;
    case keys.right:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.left += shift ? 10 : 1;
        })
      }
      break;
    case keys.up:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.top -= shift ? 10 : 1;
        })
      }
      break;
    case keys.down:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        applyToSelection(function(cur) {
          cur.top += shift ? 10 : 1;
        })
      }
      break;
    case keys.shift:
      if(data.selection.selecting && !data.selection.editing) {
        handled = true;
        data.selection.modified = true;
      }
      break;
    case keys.c:
      if((e.ctrlKey || e.metaKey) && data.selection.selections && data.selection.selections.length && !data.selection.editing) {
        handled = true;
        var cloned = cloneSelected();
        data.clipboard = cloned;
      }
      break;
    case keys.v:
      if((e.ctrlKey || e.metaKey) && data.clipboard && !data.selection.editing) {
        handled = true;
        cb = data.clipboard;
        for(var i in cb) {
          data.tree.elements.push(cb[i]);
        }
        clearSelections();
        data.selection.selecting = true;
        data.selection.selections = cb;
        data.clipboard = cloneSelected();
      }
      break;

    case keys.z:
      if(!(e.ctrlKey || e.metaKey) || data.selection.editing) break;

      handled = true;
      if(!e.shiftKey) {
        undo();
      } else {
        redo();
      }
      break;
  }

  if(handled) {
    dirty();
    e.preventDefault();
    e.stopPropagation();
  }
});

document.addEventListener("keyup", function(e) {
  var handled = false;
  switch(e.keyCode) {
    case keys.shift:
      if(data.selection.selecting) {
        handled = true;
        data.selection.modified = false;
      }
      break;
  }

  if(handled) {
    dirty();
    e.preventDefault();
    e.stopPropagation();
  }
});


eve.start = function() {
  try {
    uiWatcher(data.system.memory);
  } catch(e) {
    console.error("UI Watcher failed");
    console.log(e);
  }
  React.renderComponent(comps.wrapper(eve.data), document.querySelector("#outer-wrapper"));
  eve.dirty = false;
}

window.eve = eve;
dirty(true);

//TODO UI:
// - undo for add
// - undo for property change
// - fix center resizing
// - center snapping?
// - selection rules? (fully contained for divs, overlapping for others)
// - src property editor
// - font property editor
// - exact size property editor
// - reaction editor?
// - custom guide lines

//TODO DATA:
// - link to output
// - calculated column
// - merge
// - group
// - filter
// - cell editor
// - create table
