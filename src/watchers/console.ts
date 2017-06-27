import * as fs from "fs";
import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class FileWatcher extends Watcher {

    setup() {
        let {program:me} = this;

        me.watch("print to console log", ({find, record}) => {
            let log = find("console/log");
            return [
                record({log, text: log.text})
            ]
        })
        me.asObjects<{log:ID, text:string}>(({adds, removes}) => {
            Object.keys(adds).forEach((id) => {
                let {log, text} = adds[id];
                console.log(text);
            })
        })

        me.watch("print to console error", ({find, record}) => {
            let log = find("console/error");
            return [
                record({log, text: log.text})
            ]
        })
        me.asObjects<{log:ID, text:string}>(({adds, removes}) => {
            Object.keys(adds).forEach((id) => {
                let {log, text} = adds[id];
                console.error(text);
            })
        })

        me.watch("print to console warn", ({find, record}) => {
            let log = find("console/warn");
            return [
                record({log, text: log.text})
            ]
        })
        me.asObjects<{log:ID, text:string}>(({adds, removes}) => {
            Object.keys(adds).forEach((id) => {
                let {log, text} = adds[id];
                console.warn(text);
            })
        })


    }
}

Watcher.register("console", FileWatcher);