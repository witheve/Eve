import {Watcher, RawMap, RawValue, RawEAV} from "./watcher";
import {v4 as uuid} from "node-uuid";

interface Attrs extends RawMap<RawValue> {}

export class UIWatcher extends Watcher {

  protected static _containerGenerator(tag:string) {
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
      let id = uuid();
      let EAVs:RawEAV[] = [
        [id, "tag", tag]
      ];
      if(attrs) {
        for(let attr in attrs) {
          EAVs.push([id, attr, attrs[attr]]);
        }
      }
      for(let child of children) {
        let [childId] = child[0];
        EAVs.push([id, "children", childId]);
        for(let childEAV of child) {
          EAVs.push(childEAV);
        }
      }

      return EAVs;
    }

    return $container;

  }

  public static helpers = {
    $text: (text:RawValue, attrs?: Attrs) => {
      let id = uuid();
      let EAVs:RawEAV[] = [
        [id, "tag", "ui/text"],
        [id, "text", text]
      ];
      if(attrs) {
        for(let attr in attrs) {
          EAVs.push([id, attr, attrs[attr]]);
        }
      }
      return EAVs;
    },

    $row: UIWatcher._containerGenerator("ui/row"),
    $column: UIWatcher._containerGenerator("ui/column"),
  }

  public helpers = UIWatcher.helpers;

  setup() {
    this.program.attach("html");

    this.program
      .block("Decorate row elements as html.", ({find, record}) => {
        let elem = find("ui/row", {});
        return [elem.add("tag", "html/element").add("tagname", "row")];
      })
      .block("Decorate column elements as html.", ({find, record}) => {
        let elem = find("ui/column", {});
        return [elem.add("tag", "html/element").add("tagname", "column")];
      })
      .block("Decorate text elements as html.", ({find, record}) => {
        let elem = find("ui/text", {});
        return [elem.add("tag", "html/element").add("tagname", "text")];
      })

  }
}

Watcher.register("ui", UIWatcher);
