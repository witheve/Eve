var JSML = require("../src/editor/jsml");

var tests = [
  ["div"],
  ["span", {
    id: "test",
    customAttr: "true"
  }],
  ["p", "child1", "child2", "child3"],
  ["p", "child1", ["div", "child2"], "child3"],
  ["p", {
    class: "foo"
  }, "child1", ["div", "child2"], "child3"],
  ["pre", "test", document.createElement("p")],
  ["pre", document.createElement("p"), "test"],
];

var expectations = [
  "<div></div>",
  "<span id=\"test\" customattr=\"true\"></span>",
  "<p>child1child2child3</p>",
  "<p>child1<div>child2</div>child3</p>",
  "<p class=\"foo\">child1<div>child2</div>child3</p>",
  "<pre>test<p></p></pre>",
  "<pre><p></p>test</pre>"
];

for(var testIx = 0, len = tests.length; testIx < len; testIx++) {
  console.log("Test", testIx + 1);
  var result = JSML.parse(tests[testIx]).outerHTML;
  var expected = expectations[testIx];
  if(result == expected) {
    console.log("PASS", result);
  } else {
    console.log("FAIL", result, expected);
  }
}
