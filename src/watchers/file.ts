import * as fs from "fs";
import {Watcher} from "./watcher";
import {ID} from "../runtime/runtime";

class FileWatcher extends Watcher {

    setup() {
        let {program:me} = this;

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

    }
}


Watcher.register("file", FileWatcher);