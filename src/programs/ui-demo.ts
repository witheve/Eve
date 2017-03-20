import {Program} from "../watchers/watcher";

let prog = new Program("UI Demo");
prog.attach("ui");
prog.block("test field-table", ({find, record}) => {
  let turtle = find("turtle");
  return [
    record("ui/field-table", "ui/editable", {turtle}).add("field", [
      record({attribute: "attr1", value: "val1", froof: "blue"}),
      record({attribute: "attr1", value: "val1-2"}),
      record("ui/editable", {attribute: "attr2"}).add("value", [
        "foo", "bar", "baz"
      ]),
      record({attribute: "attr3"}).add("value", [
        1
      ]),
    ])
  ];
});

prog.block("Display field changes", ({find, record}) => {
  let turtle = find("turtle");
  let table = find("ui/field-table", {turtle});
  let field_change = table.change;
  let cell = field_change.cell;
  return [
    record("ui/column", "changelog", {field_change, style: record({"align-self": "flex-start", flex: "0 0 auto", border: "1px solid black", padding: 10, margin: 10})}).add("children", [
      record("ui/text", {sort: cell.column, text: `${cell.column}: ${cell.initial} => ${cell.value}`})
    ])
  ];
});

prog.block("Decorate the changes with whatever extra info was on the field.", ({find, lookup, not, record}) => {
  let changelog = find("changelog");
  let {field_change} = changelog;
  let {attribute, value} = lookup(field_change.field);
  attribute != "attribute";
  attribute != "value";
  // not(() => {attribute == "tag"; value == "ui/editable"});
  return [
    changelog.add("children", [
      record("ui/text", "changelog", {sort: `__${attribute}`, text: `${attribute}: ${value}`})
    ])
  ];
});

prog.block("Demo autocomplete.", ({find, record}) => {
  let person = find("person");
  return [
    record("ui/autocomplete", {placeholder: "person..."}).add("completion", [
      record({text: person.name})
    ])
  ];
})

prog.commit("Test autocomplete data", ({find, record}) => {
  find("turtle");
  return [
    record("person", {name: "Jeff Smith"}),
    record("person", {name: "George Washington"}),
    record("person", {name: "Svenka Peterson"}),
    record("person", {name: "Jeff Bloom"}),
    record("person", {name: "Jean Gray"})
  ];
})
prog.inputEavs([
  [1, "tag", "turtle"]
]);
