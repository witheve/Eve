import {Program} from "../src/runtime/dsl2";
import {verify} from "./util";
import * as test from "tape";

test("Choose: basic", (assert) => {

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let [info] = choose(() => {
      person.dog;
      return "cool";
    }, () => {
      return "not cool";
    });
    return [
      record("dog-less", {info})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
  ], [
    [2, "tag", "dog-less", 1],
    [2, "info", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "dog", "spot"],
  ], [
    [2, "tag", "dog-less", 1, -1],
    [2, "info", "not cool", 1, -1],
    [3, "tag", "dog-less", 1],
    [3, "info", "cool", 1],
  ])

  assert.end();
});

// @TODO: Give this a better name when we figure out the specific issue.
test("Busted partial identity choose", (assert) => {
  let prog = new Program("test");
  prog.block("Split up our cat attributes", ({find, lookup, record}) => {
    let cat = find("cat");
    let {attribute, value} = lookup(cat);
    return [
      // @NOTE: Issue has to do with add, can't repro if value is part of the identity.
      record("cat-attribute", {cat, attribute}).add("value", value)
    ];
  })

  prog.block("Create value records for each cat attribute.", ({find, lookup, choose, record}) => {
    let catAttribute = find("cat-attribute");
    // Tags about cats are cool.
    // @FIXME: In some (but not all) cases where the first branch matches both branches emit.
    //         This may be multiplicity/retraction related.
    let [attrName] = choose(
      () => { catAttribute.attribute == "tag"; return "cool tags"; },
      () => catAttribute.attribute
    );

    let {cat, value} = catAttribute;
    return [
      record("cat-value", {cat, attr: attrName, val: value})
    ];
  });

  verify(assert, prog, [
    [1, "tag", "pet"],
    [1, "tag", "cat"],
    [1, "name", "Felicia"],
  ], [
    [2, "tag", "cat-attribute", 1],
    [2, "cat", 1, 1],
    [2, "attribute", "tag", 1],
    [2, "value", "pet", 1],
    [2, "value", "cat", 1],

    [3, "tag", "cat-attribute", 1],
    [3, "cat", 1, 1],
    [3, "attribute", "name", 1],
    [3, "value", "Felicia", 1],

    [4, "tag", "cat-value", 2],
    [4, "cat", 1, 2],
    [4, "attr", "cool tags", 2],
    [4, "val", "pet", 2],

    [5, "tag", "cat-value", 2],
    [5, "cat", 1, 2],
    [5, "attr", "cool tags", 2],
    [5, "val", "cat", 2],

    [6, "tag", "cat-value", 2],
    [6, "cat", 1, 2],
    [6, "attr", "name", 2],
    [6, "val", "Felicia", 2],
  ]);

  assert.end();
});

test("Choose: multiple return", (assert) => {

  let prog = new Program("test");
  prog.block("simple block", ({find, record, lib, choose}) => {
    let person = find("person");
    let [displayName, coolness] = choose(() => {
      return [person.nickName, "cool"];
    }, () => {
      return [person.name, "not cool"];
    });
    return [
      person.add("displayName", displayName),
      person.add("coolness", coolness),
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "joseph"],
  ], [
    [1, "displayName", "joseph", 1],
    [1, "coolness", "not cool", 1],
  ])

  verify(assert, prog, [
    [1, "nickName", "joey"],
  ], [
    [1, "displayName", "joseph", 1, -1],
    [1, "coolness", "not cool", 1, -1],
    [1, "displayName", "joey", 1],
    [1, "coolness", "cool", 1],
  ])

  verify(assert, prog, [
    [1, "nickName", "joey", 0, -1],
  ], [
    [1, "displayName", "joseph", 1],
    [1, "coolness", "not cool", 1],
    [1, "displayName", "joey", 1, -1],
    [1, "coolness", "cool", 1, -1],
  ])

  assert.end();
});

test("Choose: moves only", (assert) => {

  let prog = new Program("test");
  prog.block("simple block", ({find, record, choose}) => {
    let person = find("person");
    let {name} = person;
    let [displayName] = choose(
      () => { name == "christopher"; return "chris"; },
        () => name
    );
    return [
      person.add({displayName})
    ]
  });

  verify(assert, prog, [
    [1, "tag", "person"],
    [1, "name", "christopher"],
    [2, "tag", "person"],
    [2, "name", "jane"],
  ], [
    [1, "displayName", "chris", 1],
    [2, "displayName", "jane", 1],
  ])

  assert.end();
});

