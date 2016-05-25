"use strict"

var activeElements = {"root": document.createElement("div")};
var activeStyles = {};
var supportedTags = {"div": true, "span": true};

function denormalizeResult(result) {
  let {insert, remove} = result;
  let additions = {};
  // build up a representation of the additions
  for(let ins of insert) {
    let [entity, attribute, value] = ins;
    if(!additions[entity]) additions[entity] = {}
    switch(attribute) {
      case "tag":
        // we don't care about tags on this guy unless they relate
        // to dom tags
        if(!supportedTags[value]) {
          continue;
        }
        break;
      case "children":
        let children = additions[entity][attribute];
        if(!children) {
          children = [];
          additions[entity][attribute] = children;
        }
        children.push(value);
        continue;
      case "text":
        attribute = "textContent"
        break;
    }
    additions[entity][attribute] = value
  }
  // do removes that aren't just going to be overwritten by
  // the adds
  for(let rem of remove) {
    let [entity, attribute, value] = rem;
    switch(attribute) {
      case "tag":
        break;
      case "children":
        break;
      case "text":
        attribute = "textContent"
        break;
    }
  }

  let styles = [];
  let entities = Object.keys(additions)
  for(let entId of entities) {
    let ent = additions[entId];
    let elem = activeElements[entId]
    // if we don't have an element already and this one doesn't
    // have a tag, then we just skip it (e.g. a style)
    if(!elem && !ent.tag)  continue;
    if(!elem) {
      //TODO: support finding the correct tag
      elem = document.createElement(ent.tag || "div")
      activeElements[entId] = elem;
      activeElements.root.appendChild(elem);
    }
    let attributes = Object.keys(ent);
    for(let attr of attributes) {
      let value = ent[attr];
      if(attr == "children") {
        for(let child of value) {
          if(activeElements[child]) {
            elem.appendChild(child);
          } else {
            let childAddition = additions[child];
            // FIXME: if somehow you get a child id, but that child
            // has no facts provided, we'll just lose that information
            // here..
            if(childAddition) {
              childAddition._parent = entId;
            }
          }
        }
      } else if(attr == "style") {
        styles.push(value);
        activeStyles[value] = elem;
      } else if(attr == "textContent") {
        elem.textContent = value;
      } else if(attr == "_parent") {
        let parent = activeElements[value];
        parent.appendChild(elem);
      } else {
        elem.setAttribute(attr, value);
      }
    }
  }

  for(let styleId of styles) {
    let style = additions[styleId];
    let elem = activeStyles[styleId];
    if(!elem) {
      console.error("Got a style for an element that doesn't exist.");
      continue;
    }
    let elemStyle = elem.style;
    let styleAttributes = Object.keys(style);
    for(let attr of styleAttributes) {
      elemStyle[attr] = style[attr];
    }
  }
}

document.body.appendChild(activeElements["root"])

denormalizeResult({insert: [["foo", "tag", "div"], ["foo", "children", "bar"], ["foo", "children", "woot"], ["bar", "tag", "span"], ["bar", "style", "bar-style"], ["bar-style", "color", "red"], ["bar", "text", "meh"], ["woot", "tag", "span"], ["woot", "text", "ZOMG"]], remove: []})
denormalizeResult({insert: [["woot", "text", "ya wai"], ["woot", "style", "woot-style"], ["woot-style", "background", "blue"], ["bar", "text", "no wai"]], remove: []})
