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
      })

    // Buttons
      .block("Decorate button elements as html.", ({find, record}) => {
        let elem = find("ui/button");
        return [elem.add("tag", "html/element").add("tagname", "div").add("class", "button")];
      })
      .block("Decorate button elements with icons.", ({find, record}) => {
        let elem = find("ui/button");
        return [elem.add("class", "iconic").add("class", `ion-${elem.icon}`)];
      })

  }
}

Watcher.register("ui", UIWatcher);
