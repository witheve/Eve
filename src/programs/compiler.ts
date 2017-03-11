import {Program} from "../runtime/dsl2";

let prog = new Program("compiler test");
prog.attach("compiler");
prog.attach("ui");


// v1 = [#eve/compiler/var]
// v2 = [#eve/compiler/var]
// vName = [#eve/compiler/var]
// [#eve/compiler/block name:"some cool block" constraint:
//    [#eve/compiler/record record:v1 attribute:
//      [attribute:"tag", value:"person"]
//      [attribute:"tag", value:"employee"]
//      [attribute:"name", value:vName]]
//    [#eve/compiler/output record:v2 attribute:
//      [attribute:"tag", value:"ui/text"]
//      [attribute:"text", value:vName]]
//  ]

prog.inputEavs([
  ["v1", "tag", "eve/compiler/var"],
  ["v2", "tag", "eve/compiler/var"],
  ["vName", "tag", "eve/compiler/var"],

  [1, "tag", "eve/compiler/block"],
  [1, "name", "some cool block"],
  [1, "constraint", "v1Record"],
  [1, "constraint", "v2Record"],

  ["v1Record", "tag", "eve/compiler/record"],
  ["v1Record", "record", "v1"],
  ["v1Record", "attribute", "v1TagPerson"],
  ["v1Record", "attribute", "v1TagEmployee"],
  ["v1Record", "attribute", "v1Name"],

    ["v1TagPerson", "attribute", "tag"],
    ["v1TagPerson", "value", "person"],

    ["v1TagEmployee", "attribute", "tag"],
    ["v1TagEmployee", "value", "employee"],

    ["v1Name", "attribute", "name"],
    ["v1Name", "value", "vName"],

  ["v2Record", "tag", "eve/compiler/output"],
  ["v2Record", "record", "v2"],
  ["v2Record", "attribute", "v2TagText"],
  ["v2Record", "attribute", "v2Text"],

    ["v2TagText", "attribute", "tag"],
    ["v2TagText", "value", "ui/text"],

    ["v2Text", "attribute", "text"],
    ["v2Text", "value", "vName"],

  ["JANE", "tag", "person"],
  ["JANE", "tag", "employee"],
  ["JANE", "name", "Jane"],
])

setTimeout(() => {
  prog.inputEavs([
    ["v2Text", "value", "vName", -1],
    ["v2Text", "value", "woah!"],
  ])
}, 1000)
