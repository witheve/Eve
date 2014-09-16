var c = window.c;
var vars = {};
var constraints = {};
var solveQueued = false;
var renderQueued = false;
var changeQueue = [];

function createSolver() {
  var solver = new c.SimplexSolver();
  solver.autoSolve = false;
  solver._addCallback(onSolve);
  return solver;
}

function initWindowVars() {
  var width = "window.width";
  vars[width] = new c.Variable({name: width, value: window.innerWidth, extra: ["window", "innerWidth"]});

  var height = "window.height";
  vars[height] = new c.Variable({name: height, value: window.innerHeight, extra: ["window", "innerHeight"]});
  onWindowResize();

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  swapConstraint("window.width", eq(vars["window.width"], window.innerWidth));
  swapConstraint("window.height", eq(vars["window.height"], window.innerHeight));
}

function wrapPosition(id) {
  var elem = $(id);
  elem.css("position", "absolute");

  var top = id + ".top";
  vars[top] = new c.Variable({name: top, value: 0, extra: [id, "top"]});

  var left = id + ".left";
  vars[left] = new c.Variable({name: left, value: 0, extra: [id, "left"]});

  var box = elem.get(0).getBoundingClientRect();

  var width = id + ".width";
  vars[width] = new c.Variable({name: width, value: 0, extra: [id, "width"]});
  swapConstraint(width, eq(vars[width], box.width));

  var height = id + ".height";
  vars[height] = new c.Variable({name: height, value: 0, extra: [id, "height"]});
  swapConstraint(height, eq(vars[height], box.height));
}

function removeConstraint(name) {
  var old = constraints[name];
  if(old) {
    constraints[name] = null;
    solver.removeConstraint(old);
  }
}

function swapConstraint(name, neue) {
  removeConstraint(name);
  constraints[name] = neue;
  solver.addConstraint(neue);
  if(!solveQueued) {
    setTimeout(function() { runSolver(solver); }, 0);
    solveQueued = true;
  }
}

var weak = c.Strength.weak;
var medium = c.Strength.medium;
var strong = c.Strength.strong;
var required = c.Strength.required;

var eq  = function(a1, a2, strength, w) {
  return new c.Equation(a1, a2, strength || weak, w||0);
};
var neq = function(a1, a2, a3) { return new c.Inequality(a1, a2, a3); };
var geq = function(a1, a2, str, w) { return new c.Inequality(a1, c.GEQ, a2, str, w); };
var leq = function(a1, a2, str, w) { return new c.Inequality(a1, c.LEQ, a2, str, w); };

var stay = function(v, strength, weight) {
  return new c.StayConstraint(v, strength||weak, weight||0);
};
var weakStay =     function(v, w) { return stay(v, weak,     w||0); };
var mediumStay =   function(v, w) { return stay(v, medium,   w||0); };
var strongStay =   function(v, w) { return stay(v, strong,   w||0); };
var requiredStay = function(v, w) { return stay(v, required, w||0); };

function runSolver(s) {
  //console.log("running solver");
  s.resolve();
  solveQueued = false;
}


function renderChangeQueue() {
  //console.log("rendering");
  var len = changeQueue.length;
  var name, value;
  for(var i = 0; i < len; i = i + 2) {
    name = changeQueue[i];
    value = changeQueue[i + 1];
    extra = vars[name].extra;
    attrs = {};
    attrs[extra[1]] = value;
    $(extra[0]).css(attrs);
  }
  changeQueue = [];
  renderQueued = false;
}

function onSolve(changes) {
  //console.log(changes);
  if(changes.length !== 0) {
    Array.prototype.push.apply(changeQueue, changes);
    if(!renderQueued) {
      requestAnimationFrame(renderChangeQueue);
      renderQueued = true;
    }
  }
}

function centerX(parent, child) {
  return eq(vars[child + ".left"], c.minus(c.divide(vars[parent + ".width"], 2),
                                           c.divide(vars[child + ".width"], 2)));
}

function centerY(parent, child) {
  return eq(vars[child + ".top"], c.minus(c.divide(vars[parent + ".height"], 2),
                                          c.divide(vars[child + ".height"], 2)));
}

function below(parent, child, margin) {
  return eq(vars[child + ".top"], c.plus(c.plus(vars[parent + ".top"],
                                                vars[parent + ".height"]),
                                         margin || 0
                                        ));
}


var solver = createSolver();
initWindowVars();

var numItems = 100;

function createItems() {
  console.time("create: " + numItems);
  var frag = document.createDocumentFragment();
  for(var i = 0; i < numItems; i++) {
    var el = document.createElement("div");
    el.style.background = "red";
    el.style.width = "10px";
    el.style.height = "10px";
    el.id = "foo" + i;
    el.style.position = "absolute";
    frag.appendChild(el);
  }

  document.body.appendChild(frag);
  console.timeEnd("create: " + numItems);
}

function testBelow() {
  console.time("position");
  wrapPosition("#foo0");
  for(var i = 1; i < numItems; i++) {
    var id = "#foo" + i;
    var prevId = "#foo" + (i - 1);
    wrapPosition(id);
    swapConstraint(id + ".below", below(prevId, id, 10));
    swapConstraint(id + ".centerx", centerX("window", id));
  }
  console.timeEnd("position");
}

createItems();
testBelow();

// wrapPosition(".project-selection");
// swapConstraint(".project-selection.left", eq(vars[".project-selection.left"], 300));
// swapConstraint(".project-selection.top", eq(vars[".project-selection.top"], 100));
// swapConstraint(".project-selection.left", centerX("window", ".project-selection"));


// var cur = 0;
// var t = setInterval(function() {
//   cur = cur + 1;
//   height = (Math.sin(cur / 10) + 1) * 100;
//   swapConstraint(".project-selection.top", eq(vars[".project-selection.top"], height));
// }, 16);
// clearTimeout(t);

// removeConstraint(".project-selection.left");

// swapConstraint(".project-selection.left", eq(vars[".project-selection.left"], vars[".project-selection.top"]));

//margin constraints
//padding constraints
//inside constraints
//width/height constraints
