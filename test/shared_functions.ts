import * as test from "tape";
import {Evaluation, Database} from "../src/runtime/runtime";
import * as join from "../src/runtime/join";
import * as parser from "../src/runtime/parser";
import * as builder from "../src/runtime/builder";
import {InsertAction, RemoveAction} from "../src/runtime/actions";
import {BrowserSessionDatabase} from "../src/runtime/databases/browserSession";


export function dedent(str) {
  let lines = [];
  let indent;
  for(let line of str.split("\n")) {
    let match = line.match(/^[ \t]+/);
    if(match) {
      if(!indent) {
        indent = match[0].length;
      }
      line = line.substr(indent);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function eavsToComparables(eavs, entities, index = {}) {
  let results = [];
  for(let eav of eavs) {
    let [e,a,v] = eav;
    let cur = index[e];
    if(!index[e]) {
      cur = index[e] = {list: [], links: [], e};
      results.push(cur);
    }
    if(entities[v]) {
      cur.links.push([a, v]);
    } else {
      let avKey = `${a}, ${v}`;
      cur.list.push(avKey);
    }
  }
  return results;
}

export function isSetEqual(as, bs) {
  if(as.length !== bs.length) return false;
  for(let a of as) {
    if(bs.indexOf(a) === -1) return false;
  }
  return true;
}

function collectEntities(eavs, index = {}) {
  for(let [e] of eavs) {
    index[e] = true;
  }
  return index;
}

enum Resolution {
  unknown,
  resolved,
  failed
}

export function resolveLinks(aLinks, bLinks, entities) {
  if(aLinks.length !== bLinks.length) return Resolution.failed;
  for(let [a, v] of aLinks) {
    let resolved = entities[v];
    if(resolved === true) {
      return Resolution.unknown;
    } else if(resolved === undefined) {
      throw new Error("Found a link for a non entity. " + [a,v])
    }
    if(bLinks.some(([a2,v2]) => a2 === a && v2 === resolved).length === 0) {
      return Resolution.failed;
    }
  }
  return Resolution.resolved;
}

export function resolveActualExpected(assert, actuals, expecteds, entities) {
  let ix = 0;
  let max = actuals.length * actuals.length;
  while(actuals[ix]) {
    let actual = actuals[ix];
    if(ix === max) {
      assert.true(false, "Cyclic test found");
      return;
    }
    ix++;
    let found;
    let expectedIx = 0;
    for(let expected of expecteds) {
      let listEqual, linkEqual;
      if(isSetEqual(expected.list, actual.list)) {
        listEqual = true;
      } else {
        found = false;
      }
      if(actual.links || expected.links) {
        let res = resolveLinks(actual.links, expected.links, entities);
        if(res === Resolution.failed) {
          linkEqual = false;
        } else if(res === Resolution.resolved) {
          linkEqual = true;
        } else {
          linkEqual = false;
          actuals.push(actual);
          break;
        }
      } else {
        linkEqual = true;
      }
      if(listEqual && linkEqual) {
        expecteds.splice(expectedIx, 1);
        entities[actual.e] = expected.e;
        found = true;
        break;
      }
      expectedIx++;
    }
    if(found === false) {
      assert.true(false, "No matching add found for object: " + JSON.stringify(actual.list))
    }
  }
}

export function verify(assert, adds, removes, data) {
  assert.equal(data.insert.length, adds.length, "Wrong number of inserts");
  assert.equal(data.remove.length, removes.length, "Wrong number of removes");

  // get all the entities
  let entities = collectEntities(adds);
  entities = collectEntities(data.insert, entities);
  entities = collectEntities(removes, entities);
  entities = collectEntities(data.remove, entities);

  //
  let expectedAdd = eavsToComparables(adds, entities);
  let expectedRemove = eavsToComparables(removes, entities);
  let actualRemove = eavsToComparables(data.remove, entities);
  let actualAdd = eavsToComparables(data.insert, entities);

  resolveActualExpected(assert, actualAdd, expectedAdd, entities);
  resolveActualExpected(assert, actualRemove, expectedRemove, entities);
}

export function evaluate(assert, expected, code, session = new Database()) {
  let parsed = parser.parseDoc(dedent(code), "0");
  let {blocks, errors} = builder.buildDoc(parsed.results);
  if(expected.errors) {
    assert.true(parsed.errors.length > 0 || errors.length > 0, "This test is supposed to produce errors");
  }
  session.blocks = session.blocks.concat(blocks);
  let evaluation = new Evaluation();
  evaluation.registerDatabase("session", session);
  let changes = evaluation.fixpoint();
  verify(assert, expected.insert, expected.remove, changes.result());
  let next = {execute: (expected, actions) => {
    let changes = evaluation.executeActions(actions);
    verify(assert, expected.insert, expected.remove, changes.result());
    return next;
  }, session};
  return next;
}

export function testSingleExpressionByList(list:any[]){
  list.forEach((list_item,index) =>{
    test(`Is ${list_item.Expression} returning ${list_item.Value}?`, (assert) => {
      let expected = {
        insert: [
          ["a", "result", list_item.Value],
        ],
        remove: [],
      };

      evaluate(assert, expected, `
        ~~~
        search
          x = ${list_item.Expression}

        bind
          [result: x]
        ~~~
      `);
      assert.end();
    });
  });
}
