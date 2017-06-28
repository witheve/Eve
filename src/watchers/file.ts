import * as fs from "fs";
import {Watcher, RawEAV} from "./watcher";
import {ID} from "../runtime/runtime";

export class FileWatcher extends Watcher {

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
    me.watch("Read a file.", ({find, record, choose}) => {
      let file = find("file/read");
      let encoding = choose(() => file.encoding, () => "utf-8");
      return [
        record({file, path: file.path, encoding})
      ]
    })
    .asObjects<{file:ID, path:string, encoding:string}>(({adds, removes}) => {
      Object.keys(adds).forEach((id) => {
        let {file, path, encoding} = adds[id];
          fs.readFile(path, {encoding}, function(err, contents){
            if (!err) {
              me.inputEAVs([[file, "contents", contents]]);
            } else {
              let id = `${file}|error`
              let changes:RawEAV[] = [];
              changes.push(
                [id, "tag", "file/error"],
                [id, "file", file],
                [id, "code", `${err.code}`],
                [id, "message", `${err.message}`]
              );
              me.inputEAVs(changes);
            }
          });
        })
      })
    }

    if(fs.writeFile) {
      me.watch("Write a file.", ({find, record, choose}) => {
        let file = find("file/write");
        let encoding = choose(() => file.encoding, () => "utf-8");
        return [
          record({file, path: file.path, encoding, contents: file.contents})
        ]
      })
      .asObjects<{file:ID, path:string, contents: string, encoding:string}>(({adds, removes}) => {
        Object.keys(adds).forEach((id) => {
          let {file, path, contents, encoding} = adds[id];
          fs.writeFile(path, contents, {encoding: encoding}, function(err){
            if (!err) {
              me.inputEAVs([[file, "tag", "file/complete"]])
            } else {
              let id = `${file}|error`
              let changes:RawEAV[] = [];
              changes.push(
                [id, "tag", "file/error"],
                [id, "file", file],
                [id, "code", `${err.code}`],
                [id, "message", `${err.message}`]
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