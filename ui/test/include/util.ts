"use strict";
/// <reference path="../../typings/casperjs/casperjs.d.ts" />

module Test {
  export interface CasperUtil extends Casper {
    __env?:any
    __util:typeof util
  }

  export type Selector = string;

  declare var casper:CasperUtil;
  // https://github.com/creativelive/spook/#saving-screenshots
  let _capture = casper.capture.bind(casper);
  if(casper.cli.options.disableCapture) {
    console.log("Disabling capture due to --disableCapture.");
    casper.capture = function() { return this; }
  }

  casper.__env = {
    basePath: casper.cli.options.basePath,
    baseUrl: casper.cli.options.baseUrl || "localhost:8080"
  };

  //---------------------------------------------------------
  // Testing utilities for Eve
  //---------------------------------------------------------

  function shiftClick(selection:Selector|Selector[], shiftInitial:boolean = false):CasperUtil {
    let sel:Selector[];
    if(!selection || !selection.length) { return casper; }
    if(selection.constructor !== Array) {
      sel = [<Selector> selection];
    } else {
      sel = <Selector[]> selection;
    }

    let mod = (shiftInitial) ? casper.page.event.modifier.shift : undefined;
    for(let s of sel) {
      let elemsBounds = casper.getElementsBounds(s);
      for(let bounds of elemsBounds) {
        casper.page.sendEvent("click", bounds.left + 1, bounds.top + 1, "left", mod);
        mod = casper.page.event.modifier.shift;
      }
    }
    return casper;
  }

  function item<T extends {}>(prefixKind:string|string[] = [], extra:T = <T>{}) {
    let prefixKinds = [].concat(prefixKind);
    let util = {
      select(kind:string|string[] = [], ix?:number, within?:string):Selector {
        let kinds:string[] = prefixKinds.concat(kind);
        let semantic = (kinds && kinds.length) ? `[data-semantic^="item::${kinds.join("::")}"]` : `[data-semantic^="item"]`;
        let nthChild = (ix !== undefined) ? `:nth-child(${ix})` : "";
        return (within ? within + " " : "") + semantic + nthChild;
      },
      count(kind?:string|string[], within?:string):number {
        let sel = this.select(kind, undefined, within);
        if(!casper.exists(sel)) { return 0; }
        let elems = casper.getElementsBounds(sel);
        return elems.length;
      },
      selection(kind?:string, ix?:number, within?:string):Selector {
        return this.select(kind, ix, within) + ".selected";
      },
      selectionCount(kind?:string, within?:string):number {
        let sel = this.selection(kind, undefined, within);
        if(!casper.exists(sel)) { return 0; }
        let elems = casper.getElementsAttribute(sel, "class");
        return elems.length;
      },
      selected(kind?:string, ix?:number, within?:string):boolean {
        let sel = this.select(kind, ix, within);
        if(!casper.exists(sel)) { throw new Error(`Item ${kind} ${ix} does not exist, cannot be selected.`); }
        let classes = casper.getElementsAttribute(sel, "class");
        for(let klass of classes) {
          if(klass.indexOf("selected") === -1) {
            return false;
          }
        }
        return true;
      }
    };
    for(let key in util) {
      if(!extra[key]) {
        extra[key] = util[key];
      }
    }
    return <T & typeof util> extra;
  }

  var util = {
    action: {
      select(name:string):Selector {
        return `[data-semantic="action::${name}"]`;
      },
      enabled(name:string):boolean {
        let sel = util.action.select(name);
        let classes = casper.getElementAttribute(sel, "class");
        return classes.indexOf("disabled") === -1;
      }
    },
    pane: {
      select(name:string):Selector {
        return `[data-semantic="pane::${name}"]`;
      }
    },
    item: item(undefined, {
      tab: item("tab"),
      card: item("card")
    }),

    // Interactions
    shiftClick,

    // Assertions
    assertActions(actions:string[], enabled:{[action:string]: any}, test:Tester) {
      return actions.forEach(function(action) {
        test.assertExists(util.action.select(action));
        test.assert(!!enabled[action] == util.action.enabled(action), `Action ${action} should be ${enabled[action] ? "enabled" : "disabled"}`);
      });
    }
  };
  casper.__util = util;
}
