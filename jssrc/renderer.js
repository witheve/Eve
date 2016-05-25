"use strict"

function denormalizeResult(result) {
  let {insert, remove} = result;
  let additions = {};
  // build up a representation of the additions
  for(let ins of insert) {
    let [entity, attribute, value] = ins;
    if(!additions[entity]) additions[entity] = {}
    switch(attribute) {
      case "tag":
        break;
      case "children":
        break;
      case "text":
        attribute = "textContent"
        break;
      case "parent":
        break;
    }
    additions[entity][attribute] = value
  }
  // do removes that aren't just going to be overwritten by
  // the adds
  for(let rem of remove) {
    let [entity, attribute, value] = rem;
    switch(attribute) {
      case "children":
        break;
      case "text":
        attribute = "textContent"
        break;
      case "parent":
        break;
    }
  }

  let entities = Object.keys(changes)
  for(let ent of entities) {
    let attributes = Object.keys(ent);
    for(let attr of attributes) {

    }
  }

}
