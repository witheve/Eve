import {Program, Watcher, RawValue, RawMap, RawEAVC} from "./watcher";
import {HTMLWatcher} from "./html";

export class Notice {
  element:HTMLElement = document.createElement("notice");
  name:string;
  time:number;

  constructor(public program:Program, public id:RawValue, public type:RawValue) {
    let html = program.attach("html") as HTMLWatcher;
    html.addExternalRoot(id as string, this.element);
  }

  clear() {
    let parent = this.element.parentElement;
    if(parent) parent.removeChild(this.element);
    // @FIXME: html.removeExternalRoot.
  }
}

// @FIXME: do tihs with two program isolation instead of manual rendering?

export class NotifyWatcher extends Watcher {
  html:HTMLWatcher;
  notices:RawMap<Notice|undefined> = {};
  root:HTMLElement;
  scroller:HTMLElement;
  wrapper:HTMLElement;

  setup() {
    this.html = this.program.attach("html") as HTMLWatcher;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "notify-wrapper";
    document.body.appendChild(this.wrapper);
    this.scroller = document.createElement("div");
    this.scroller.className = "notify-scroller";
    this.wrapper.appendChild(this.scroller);

    this.root = document.createElement("column");
    this.root.className = "notify-root ui-column";
    this.scroller.appendChild(this.root);
    this.html.addExternalRoot("notify/root", this.root);

    this.program
      .bind("Notices that aren't dismissed are children of the notify root.", ({find, not}) => {
        let root = find("notify/root");
        let wrapper = find("notify/notice-wrapper");
        not(() => wrapper.notice.tag == "notify/dismissed");
        return [root.add("children", wrapper)];
      })
      .bind("Decorate notices.", ({find, choose, record}) => {
        let notice = find("notify/notice");
        let type = choose(() => notice.type, () => "info");
        return [
          record("notify/notice-wrapper", "ui/row", {notice, type}).add("children", [
            notice.add("tag", "ui/row"),
            record("ui/spacer", {sort: 5, notice})
          ])
        ];
      })
      .bind("Notices which are dismissable get a button to do so.", ({find, record}) => {
        let notice = find("notify/notice", "notify/dismissible");
        let wrapper = find("notify/notice-wrapper", {notice});
        return [wrapper.add("children", [
          record("notify/dismiss", "ui/button", {class: "flat", notice, sort: 15, icon: "close-round"})
        ])];
      })
      .commit("Dismissed notices are marked.", ({find}) => {
        let notice = find("notify/notice");
        find("html/event/click", {element: find("notify/dismiss", {notice})});
        return [notice.remove().add("tag", "notify/dismissed")];
      })
      .bind("If a notice has a timestamp, display it.", ({find, lib:{date}, record}) => {
        let notice = find("notify/notice");
        let wrapper = find("notify/notice-wrapper", {notice});
        return [
          wrapper.add("children", [
            record("ui/text", {sort: 10, notice, text: date.format(notice.timestamp, "HH:MM:ss")})
          ])
        ];
      })
      .commit("Retract timestamps for bound notices that have ceased to be.", ({find}) => {
        let {notice} = find("notify/retract-timestamp");
        return [notice.remove("timestamp")];
      })
      .watch("The notify watcher attaches a timestamp to notices without one.", ({find, not}) => {
        let notice = find("notify/notice");
        not(() => notice.timestamp);
        return [notice.add("tag", "notify/notice")];
      })
      .asDiffs(({adds}) => {
        let timestamp = Date.now();
        let eavs:RawEAVC[] = [];
        for(let [notice] of adds) eavs.push([notice, "timestamp", timestamp, 1]);
        if(eavs.length) this.program.inputEAVs(eavs);
      })
      .watch("The notify watcher also cleans up those timestamps when the notice goes away.", ({find}) => {
        let notice = find("notify/notice");
        return [notice.add("timestamp", notice.timestamp)];
      })
      .asDiffs(({removes}) => {
        if(!removes.length) return;
        let eavs:RawEAVC[] = [];
        eavs.push(["||notify/retract-timestamp", "tag", "notify/retract-timestamp", 1]);
        for(let [notice, _, timestamp] of removes) {
          eavs.push([notice, "timestamp", timestamp, -1]);
          //eavs.push(["||notify/retract-timestamp", "notice", notice, 1]);
        }
        if(eavs.length) this.program.inputEAVs(eavs);
      })
  }
}

Watcher.register("notify", NotifyWatcher);
