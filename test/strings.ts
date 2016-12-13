import * as test from "tape";
import {evaluates} from "./shared_functions";

test("test string join ordering", (assert) => {
  evaluates(assert, `
               ~~~
                 commit
                      [#foo token:"a" level:2]
                      [#foo token:"zkp" level:3]
                      [#foo token:"parg" level:0]
                      [#foo token:"naxxo" level:1]
               ~~~

                ~~~
                search
                  [#foo token level]
                  index = sort[value:token given:token]                 
                  a = join[token index given:token with:"/"]
                  a = "a/naxxo/parg/zkp"
                  b = join[token index:level given:token with:"/"]
                  b = "parg/naxxo/a/zkp"                  
                commit
                  [#success]
                ~~~
  `);
  assert.end();
});
