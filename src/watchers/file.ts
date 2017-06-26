import * as fs from "fs";
import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class FileWatcher extends Watcher {

    setup() {
        let {program:me} = this;
        
        /*
        fs.readFile("..\\foo.txt", {encoding: 'utf-8'}, function(err,data){
            if (!err) {
                console.log('received data: ' + data);
            } else {
                console.log(err);
            }
        });*/

        me.watch("read a file", ({find, record}) => {
            let readfile = find("file/read");
            return [
                record({readfile, path: readfile.path})
            ]
        })

        me.asObjects<{readfile:ID, path:string}>(({adds, removes}) => {
            Object.keys(adds).forEach((id) => {
                let {readfile, path} = adds[id];
                fs.readFile(path, {encoding: 'utf-8'}, function(err,data){
                    if (!err) {
                        let changes:any[] = [];
                        changes.push(
                            [readfile, "contents", data, 1],
                        );
                        me.inputEAVs(changes);
                    } else {
                        console.log(err);
                    }
                });
            })
        })

        // Console log watcher
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


    }
}


Watcher.register("file", FileWatcher);