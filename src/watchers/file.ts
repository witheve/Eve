import * as fs from "fs";
import {Watcher, RawEAVC} from "./watcher";
import {ID} from "../runtime/runtime";

class FileWatcher extends Watcher {

    setup() {
        let {program:me} = this;
        me.load(`
Attach errors to the associated file
~~~
search
  error = [#file/error file code message]

bind
  file.error += error
~~~     
        `)
        if(fs.readFile) {
            me.watch("read a file", ({find, record}) => {
                let file = find("file/read");
                return [
                    record({file, path: file.path, encoding: file.encoding})
                ]
            })

            me.asObjects<{file:ID, path:string, encoding:string}>(({adds, removes}) => {
                Object.keys(adds).forEach((id) => {
                    let {file, path, encoding} = adds[id];
                    fs.readFile(path, {encoding: encoding}, function(err, contents){
                        if (!err) {
                            let changes:RawEAVC[] = [];
                            changes.push(
                                [file, "contents", contents, 1],
                            );
                            me.inputEAVs(changes);
                        } else {
                            let id = `${file}|error`
                            let changes:RawEAVC[] = [];
                            changes.push(
                                [id, "tag", "file/error", 1],
                                [id, "file", file, 1],
                                [id, "code", `${err.code}`, 1],
                                [id, "message", `${err.message}`, 1]
                            );
                            me.inputEAVs(changes);
                        }
                    });
                })
            })
        }
        if(fs.writeFile) {
            me.watch("write a file", ({find, record}) => {
                let file = find("file/write");
                return [
                    record({file, path: file.path, encoding: file.encoding, contents: file.contents})
                ]
            })
            me.asObjects<{file:ID, path:string, contents: string, encoding:string}>(({adds, removes}) => {
                Object.keys(adds).forEach((id) => {
                    let {file, path, contents, encoding} = adds[id];
                    fs.writeFile(path, contents, {encoding: encoding}, function(err){
                        if (!err) {
                            console.log(`Write file success: ${contents}`)
                        } else {
                            let id = `${file}|error`
                            let changes:RawEAVC[] = [];
                            changes.push(
                                [id, "tag", "file/error", 1],
                                [id, "file", file, 1],
                                [id, "code", `${err.code}`, 1],
                                [id, "message", `${err.message}`, 1]
                            );
                            me.inputEAVs(changes);
                        }
                    });
                })
            })
        }
    }
}


Watcher.register("file", FileWatcher);