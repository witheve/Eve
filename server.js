var express = require('express')();
var server = require("http").Server(express);
var io = require("socket.io")(server);
var fs = require("fs");
var path = require("path");

var oneDay = 86400000;

express.use(require("compression")());
express.use(require("body-parser").json());
express.use(require("body-parser").urlencoded({extended: true}));

express.use(require("serve-static")(__dirname + '/resources', { maxAge: 1000 }));
express.use("/src", require("serve-static")(__dirname + '/src', { maxAge: 1000 }));
express.use("/build", require("serve-static")(__dirname + '/build', { maxAge: 1000 }));
express.use("/stylus", require("serve-static")(__dirname + '/stylus', { maxAge: 1000 }));


//-----------------------------------------------------
// hackery (much of this is modified from worker.js)
//-----------------------------------------------------

var compilerTables = ["programView", "programQuery", "subscription", "generatedView", "displayName", "view", "field", "query", "constantConstraint", "functionConstraint", "functionConstraintInput", "constantConstraint",
                      "viewConstraint", "viewConstraintBinding", "aggregateConstraint", "aggregateConstraintBinding", "aggregateConstraintSolverInput",
                      "aggregateConstraintAggregateInput", "isInput", "isCheck"];

function compileWatcher(application, storage, system) {
  var needsCompile = false;
  for(var i = 0, len = compilerTables.length; i < len; i++) {
    var table = compilerTables[i];
    var current = system.getStore(table);
    if(!needsCompile) {
      var diff = diffTables(current, storage[table])
      if(diff.adds.length || diff.removes.length) {
        needsCompile = true;
      }
    }
    storage[table] = current;
  }

  if(needsCompile) {
    var run = application.runNumber + 1;
    try {
      start = now();
      system.recompile();
      system.updateStore("profile", [[run, "compile", now() - start]], []);

      var errors = [];
      system.refresh(errors);
      if(errors.length) {
        system.updateStore("error", errorsToFacts(errors), []);
      }

    } catch(e) {
      system.updateStore("error", errorsToFacts([e]), []);
      return false;
    }
  }
  return true;
}

function webRequestWatcher(app, storage, system) {}
function timerWatcher(app, storage, system) {}
function uiWatcher(app, storage, system) {}

function remoteWatcher(app, storage, system) {
  var remoteStatuses = app.remotes;
  var remoteNames = [];

  // collect subscriptions/shares
  var subscriptions = {};
  var subsTable = system.getStore("subscription");
  var subsFacts = subsTable.getFacts();
  for(var subIx = 0, subLen = subsFacts.length; subIx < subLen; subIx++) {
    var cur = subsFacts[subIx];
    var remote = cur[0];
    var view = cur[1];
    var alias = cur[2];
    var asCell = cur[3];
    var localTable = system.getStore(view);
    var client = remoteStatuses[remote];
    if(!client || !client.ready) continue;
    if(!subscriptions[remote]) {
      subscriptions[remote] = {};
      remoteNames.push(remote);
    }
    var results = subscriptions[remote];
    if(localTable) {
      var prev = storage[remote + "|" + alias];
      var diff = diffTables(localTable, prev);
      storage[remote + "|" + alias] = localTable;
      if(asCell) {
        if(!results["resultCell"]) {
          results["resultCell"] = {adds: [], removes: []};
        }
        results["resultCell"].adds = results["resultCell"].adds.concat(factsToCells(diff.adds, alias));
        results["resultCell"].removes = results["resultCell"].removes.concat(factsToCells(diff.removes, alias));
      } else if(diff.adds.length || diff.removes.length) {
        results[alias] = {};
        results[alias].adds = diff.adds;
        results[alias].removes = diff.removes;
      }
    }
  }


  for(var remoteIx = 0, remoteLen = remoteNames.length; remoteIx < remoteLen; remoteIx++) {
    var remoteThread = remoteNames[remoteIx];
    if(subscriptions[remoteThread] && Object.keys(subscriptions[remoteThread]).length) {
      console.log("Sending to: ", remoteThread);
      var client =  remoteStatuses[remoteThread];
      client.ready = false;
      client.lastSeenRunNumber = app.runNumber;
      client.clear = false;
      var socket = remoteStatuses[remoteThread].socket;
      socket.emit("message", {to: app.name,
                              from: "server",
                              client: "server",
                              eventId: app.eventId,
                              type: "diffs",
                              diffs: JSON.stringify({}),
                              subscriptions:JSON.stringify(subscriptions[remoteThread] || {}),
                              inserts: JSON.stringify({})});
    }
  }
}

function injectRemoteDiffs(application, client, diffs, inserts, subs) {
  var start = now();
  var changed = false;
  for(var table in diffs) {
    var curDiff = diffs[table];
    if(curDiff.adds.length || curDiff.removes.length) {
      changed = true;
      application.system.updateStore(table, curDiff.adds, curDiff.removes);
    }
  }

  if(changed) {
    var didCompile = application.compileWatcher(application, application.storage["compilerWatcher"], application.system);
    if(!didCompile) return application.remoteWatcher(application, application.storage["remoteWatcher"], application.system);
  }

  var inserted = false;
  for(var table in inserts) {
    var facts = inserts[table];
    var current = application.system.getStore(table);
    if(current) {
      inserted = true;
      application.system.updateStore(table, facts, current.getFacts());
    }
  }
  for(var table in subs) {
    var diff = subs[table];
    var current = application.system.getStore(table);
    if(current) {
      inserted = true;
      application.system.updateStore(table, diff.adds, []); //diff.removes);
  //    application.storage["remoteWatcher"][client.id + "|" + table] = application.system.getStore(table);
    } else {
      console.log("failed, no table **************** ", table);
    }
  }

 if(inserted || changed) application.run([]);
}

function serverApp(app) {
  app.compileWatcher = compileWatcher;
  app.webRequestWatcher = webRequestWatcher;
  app.timerWatcher = timerWatcher;
  app.uiWatcher = uiWatcher;
  app.remoteWatcher = remoteWatcher;
  app.remotes = {};
  return app;
}

//load the eve source which is not designed to be a node module currently
var eveFiles = ["src/eve.js", "src/helpers.js"];
for(var ix in eveFiles) {
  global.eval(fs.readFileSync(eveFiles[ix]).toString());
}

//-----------------------------------------------------


//---------------------------------------------------------
// Clients
//---------------------------------------------------------

var apps = {};
var clients = {};
var socketToClient = {};

function getApplication(name) {
  if(apps[name]) return apps[name];

  apps[name] = serverApp(app());
  apps[name].name = name;
  return apps[name];
}

function getClient(client, socket) {
  var remote = clients[client];
  if(!remote || !remote.socket) {
    remote = clients[client] = {id: client, socket: socket, ready:true, apps: {}};
    socketToClient[socket.id] = remote;
  }
  return remote;
}

function unsubscribeClient(client, appName) {
  var app = getApplication(appName);
  var subs = app.system.getStore("subscription").getFacts().filter(function(cur) {
    return cur[0] === client.id;
  });
  for(var ix in subs) {
    var alias = subs[ix][2];
    app.storage["remoteWatcher"][client.id + "|" + alias] = null;
  }
  app.system.updateStore("subscription", [], subs);
}

//---------------------------------------------------------
// Message routing
//---------------------------------------------------------

io.on("connection", function(socket) {
  socket.on("disconnect", function() {
    console.log("dc'd");
    var client = socketToClient[socket.id];
    if(!client) return;

    client.socket = false;
    for(var app in client.apps) {
      unsubscribeClient(client, app);
    }
    client.apps = {};
  });
  socket.on("reconnect", function() {
    console.log("reconnect");
  });
  socket.on("message", function(data) {
    switch(data.type) {
      case "unsubscribe":
        console.log("Terminate", data.client);
        if(clients[data.client]) {
          var client = getClient(data.client, socket);
          unsubscribeClient(client, data.from);
        }
        break;
      case "diffs":
        console.log("got diffs", data.client);
        var client = getClient(data.client, socket);
        var app = getApplication(data.from);
        app.remotes[client.id] = client;
        app.eventId = data.eventId > app.eventId ? data.eventId : app.eventId;
        client.apps[data.from] = true;
        var diffs = JSON.parse(data.diffs);
        var inserts = JSON.parse(data.inserts);
        var subscriptions = JSON.parse(data.subscriptions);
        injectRemoteDiffs(app, client, diffs, inserts, subscriptions);
        client.lastSeenRunNumber = app.runNumber;
        client.socket.emit("message", {to: data.from, type: "remoteReady", from: "server", client: "server", eventId: app.eventId});
        break;

      case "remoteReady":
        var client = getClient(data.client, socket);
        var app = getApplication(data.from);
        client.ready = true;
        console.log("received remoteReady", data.client);
        if(app.running && app.runNumber !== client.lastSeenRunNumber) {
          app.remoteWatcher(app, app.storage["remoteWatcher"], app.system);
        }
        break;
    }
  });
});

//---------------------------------------------------------
// Examples / tests loading
//---------------------------------------------------------
function bundleFiles(dir, ext) {
  var bundle = {};
  var files = fs.readdirSync(dir);
  for(var i in files) {
    var file = files[i];
    if(path.extname(file) === ext) {
      var content = fs.readFileSync(path.join(dir, file)).toString();
      bundle[path.basename(file, ext)] = content;
    }
  }

  return bundle;
}

function updateFile(path, content)  {
  content = content.replace(/[ \t]+$/gm, "");
  if(content[content.length-1] != "\n") {
    content += "\n";
  }
  // Only update existing files
  if(fs.existsSync(path)) {
    fs.writeFileSync(path, content);
  }
}

express.get("/src/examples.js", function(req, res) {
  var examples = bundleFiles("examples", ".eve");
  res.send("var examples = " + JSON.stringify(examples));
});


express.post("/src/examples.js/update", function(req, res) {
  var stack = req.body.stack;
  // my stack shouldn't get written out.
  if(stack === "My Stack") return res.send("");
  updateFile("examples/" + stack + ".eve", req.body.content);
  res.send("");
});

express.get("/src/tests.js", function(req, res) {
  var tests = bundleFiles("tests", ".eve");
  res.send("var tests = " + JSON.stringify(tests));
});

express.post("/src/tests.js/update", function(req, res) {
  var stack = req.body.stack;
  updateFile("tests/" + stack + ".eve", req.body.content);
  res.send("");
});

//---------------------------------------------------------
// Go
//---------------------------------------------------------

var port = process.env.PORT || 3000;
server.listen(port);
console.log("Eve is up and running at http://localhost:" + port + "/");

