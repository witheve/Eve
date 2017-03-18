import {Watcher, RawMap, RawValue, RawEAV} from "./watcher";
import {v4 as uuid} from "node-uuid";

interface Attrs extends RawMap<RawValue|RawValue[]|RawEAV[]> {}

export class UIWatcher extends Watcher {
  protected static _addAttrs(id:string, attrs?: Attrs, eavs:RawEAV[] = []) {
    if(attrs) {
      for(let attr in attrs) {
        if(attrs[attr].constructor !== Array) {
          eavs.push([id, attr, attrs[attr] as RawValue]);

        } else {
          let vals = attrs[attr] as RawValue[] | RawEAV[];
           // We have a nested sub-object (i.e. a set of EAVs).
          if(vals[0].constructor === Array) {
            let childEavs:RawEAV[] = vals as any;
            let [childId] = childEavs[0];
            eavs.push([id, attr, childId]);
            for(let childEav of childEavs) {
              eavs.push(childEav);
            }

          } else {
            for(let val of vals as RawValue[]) {
              eavs.push([id, attr, val]);
            }
          }
        }
      }
    }
    return eavs;
  }

  protected static $elem(tag:string, attrs?: Attrs) {
    let id = uuid();
    let eavs:RawEAV[] = [
      [id, "tag", tag],
    ];
    UIWatcher._addAttrs(id, attrs, eavs);
    return eavs;
  }

  protected static _makeContainer(tag:string) {
    function $container(children: RawEAV[][]):RawEAV[];
    function $container(attrs: Attrs, children: RawEAV[][]):RawEAV[];
    function $container(attrsOrChildren?: Attrs|RawEAV[][], maybeChildren?: RawEAV[][]):RawEAV[] {
      let attrs:Attrs|undefined;
      let children:RawEAV[][];
      if(maybeChildren) {
        attrs = attrsOrChildren as Attrs|undefined;
        children = maybeChildren;
      } else {
        children = attrsOrChildren as RawEAV[][];
      }

      let eavs = UIWatcher.$elem(tag, attrs);
      let [id] = eavs[0];
      for(let child of children) {
        let [childId] = child[0];
        eavs.push([id, "children", childId]);
        for(let childEAV of child) {
          eavs.push(childEAV);
        }
      }
      return eavs;
    }
    return $container;
  }

  public static helpers = {
    $style: (attrs?: Attrs) => {
      return UIWatcher._addAttrs(uuid(), attrs);
    },
    $elem: UIWatcher.$elem,

    $text: (text:RawValue, attrs?: Attrs) => {
      let eavs = UIWatcher.$elem("ui/text", attrs);
      let [id] = eavs[0];
      eavs.push([id, "text", text]);
      return eavs;
    },
    $button: (attrs?: Attrs) => {
      return UIWatcher.$elem("ui/button", attrs);
    },
    $row: UIWatcher._makeContainer("ui/row"),
    $column: UIWatcher._makeContainer("ui/column"),
  }

  public helpers = UIWatcher.helpers;

  setup() {
    this.program.attach("html");

    this.program
    // Containers
      .block("Decorate row elements as html.", ({find, record}) => {
        let elem = find("ui/row");
        return [elem.add("tag", "html/element").add("tagname", "row")];
      })
      .block("Decorate column elements as html.", ({find, record}) => {
        let elem = find("ui/column");
        return [elem.add("tag", "html/element").add("tagname", "column")];
      })
      .block("Decorate spacer elements as html.", ({find, record}) => {
        let elem = find("ui/spacer");
        return [elem.add("tag", "html/element").add("tagname", "spacer")];
      })
      .block("Decorate input elements as html.", ({find, record}) => {
        let elem = find("ui/input");
        return [elem.add("tag", "html/element").add("tagname", "input")];
      })
      .block("Decorate text elements as html.", ({find, record}) => {
        let elem = find("ui/text");
        return [elem.add("tag", "html/element").add("tagname", "text")];
      });

    // Buttons
    this.program
      .block("Decorate button elements as html.", ({find, record}) => {
        let elem = find("ui/button");
        return [elem.add("tag", "html/element").add("tagname", "div").add("class", "button")];
      })
      .block("Decorate button elements with icons.", ({find, record}) => {
        let elem = find("ui/button");
        return [elem.add("class", "iconic").add("class", `ion-${elem.icon}`)];
      });

    // Field Table
    this.program
      .block("Decorate field tables as html.", ({find, record}) => {
        let elem = find("ui/field-table");
        return [elem.add({tag: "html/element", tagname: "table", cellspacing: 0})];
      })
      .block("Field tables have a value_row for each AV pair in their fields.", ({find, record}) => {
        let table = find("ui/field-table");
        let {field} = table;
        let {attribute, value} = field;
        return [table.add("value_row", record({field, attribute, value}))];
      })
      .block("If a table is editable: all attach each specific editing mode.", ({find, choose}) => {
        let table = find("ui/field-table", "ui/editable");
        return [table.add("editable", [
          // Modify existing
          "value",
          "attribute",
          // Create new,
          "row",
          "field"
        ])];
      })
      .block("A table's fields inherit the editing mode of their table if they don't specify their own.", ({find, choose}) => {
        let table = find("ui/field-table");
        let {field} = table;
        let [editable] = choose(() => field.editable, () => table.editable);
        return [field.add("editable", editable)];
      })

      .block("Create a row for each unique field.", ({find, choose, record}) => {
        let table = find("ui/field-table");
        let {field} = table;
        return [
          table.add("children", [
            record("ui/field-table/row", {table, field})
          ])
        ];
      })
      .commit("If a field is row editable, add value_rows for the field when no empty ones exist.", ({find, not, gather, choose, record}) => {
        let table = find("ui/field-table");
        let {field} = table;
        field.editable == "row";
        not(() => find("ui/field-table/cell", {table, field, column: "value", value: ""}))

        let [count] = choose(() => {
          let cell = find("ui/field-table/cell", {field});
          return gather(cell).per(field).count() + 1;
        }, () => 1);

        return [
          table.add("value_row", [
            record("ui/field-table/value-row/new", {sort: `zz${count}`, field, attribute: field.attribute, value: ""})
          ])
        ];
      })
      .commit("If a field is row editable, clear any excess empty rows.", ({find, record}) => {
        let table = find("ui/field-table");
        let {field} = table;
        field.editable == "row";
        let cell = find("ui/field-table/cell", {table, field, column: "value", value: ""});
        let other = find("ui/field-table/cell", {table, field, column: "value", value: ""});
        other.sort > cell.sort;
        return [other.value_row.remove()];
      })

      .commit("If a table is field editable, add a field when no empty ones exist.", ({find, not, gather, choose, record}) => {
        let table = find("ui/field-table", {editable: "field"});

        not(() => find("ui/field-table/attribute", {table, column: "attribute", value: ""}))

        let [count] = choose(() => {
          table == find("ui/field-table"); // @FIXME: Hackaround aggregate bug.
          return gather(table.field).per(table).count() + 1;
        }, () => 1);

        return [
          table.add("field", [
            record("ui/field-table/field/new", {sort: `zz${count}`, attribute: "", value: ""})
          ])
        ];
      })
      .commit("If a table is field editable, clear any excess empty fields.", ({find, lookup, not, choose, record}) => {
        let table = find("ui/field-table", {editable: "field"});
        let table_alias = find("ui/field-table", {editable: "field"});
        table == table_alias;
        // Two new fields exist
        let field = find("ui/field-table/field/new");
        let other_field = find("ui/field-table/field/new");
        // In the same table
        table.field == field;
        table_alias.field == other_field;
        // Both are empty
        not(() => table.change.field == field);
        not(() => table_alias.change.field == other_field);
        // And the other is before this one.
        other_field.sort < field.sort;
        return [field.remove()];
      })

      .block("Each field row has an attribute and a value set.", ({find, choose, record}) => {
        let field_row = find("ui/field-table/row");
        let {table, field} = field_row;
        let [sort] = choose(() => field.sort, () => field.attribute, () => 1);

        return [
          field_row.add({tag: "html/element", tagname: "tr", sort}).add("children", [
            record("html/element", {sort: 1, tagname: "td", table, field}).add("children", [
              record("ui/field-table/attribute", "ui/field-table/cell", {table, field, value_row: field, column: "attribute"})
            ]),
            record("html/element", {sort: 2, tagname: "td", table, field}).add("children", [
              record("ui/field-table/value-set", "ui/column", {table, field})
            ])
          ])
        ];
      })
      .block("Create a value for each field value in the value set.", ({find, choose, record}) => {
        let value_set = find("ui/field-table/value-set");
        let {table, field} = value_set;
        let {value_row} = table;
        value_row.field == field;
        let {value} = value_row;
        let [sort] = choose(() => value_row.sort, () => value);
        return [
          value_set.add("children", [
            record("ui/field-table/value", "ui/field-table/cell", {sort, table, field, value_row, column: "value"}),
          ])
        ];
      })

      .block("The initial value of a cell is pulled off it's value_row or field.", ({find, choose, not, lookup, record}) => {
        let cell = find("ui/field-table/cell");
        let {field, value_row, column} = cell;
        let {attribute, value:initial} = lookup(value_row);
        attribute == column;
        return [cell.add("initial", initial)]
      })

      .block("Draw field cells as text unless they're editable.", ({find, not}) => {
        let cell = find("ui/field-table/cell");
        let {field, column, initial} = cell;
        not(() => field.editable == column);
        return [cell.add({tag: "ui/text", text: initial})];
      })

      .block("Draw field cells as inputs when they're editable.", ({find}) => {
        let cell = find("ui/field-table/cell");
        let {field, column, initial} = cell;
        field.editable == column;
        return [cell.add({tag: ["ui/input", "html/autosize-input"], placeholder: `${column}...`})];
      })

      .block("When a cell changes value, update the tables changes list.", ({find, lookup, record}) => {
        let cell = find("ui/field-table/cell");
        let {table, field, column, value, value_row, initial} = cell;
        field.editable == column;
        value != initial;
        return [table.add("change", [
          record("ui/field-change", {field}).add("cell", [
            record({column, initial, value})
          ])
        ])];
      })

  }
}

Watcher.register("ui", UIWatcher);
