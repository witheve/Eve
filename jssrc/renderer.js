"use strict"

var activeElements = {"root": document.createElement("div")};
var activeStyles = {};
var supportedTags = {"div": true, "span": true};

function insertSorted(parent, child) {
  let current;
  for(let curIx = 0; curIx < parent.children.length; curIx++) {
    current = parent.children[curIx];
    if(current.ix && current.ix > child.ix) {
      break;
    }
  }
  parent.insertBefore(child, current);
}

function denormalizeResult(result) {
  let {insert, remove} = result;
  let additions = {};
  // build up a representation of the additions
  if(insert.length) {
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
  }
  // do removes that aren't just going to be overwritten by
  // the adds
  if(remove.length) {
    // we clean up styles after the fact so that in the case where
    // the style object is being removed, but the element is sticking
    // around, we remove any styles that may have been applied
    let stylesToGC = [];
    for(let rem of remove) {
      let [entity, attribute, value] = rem;
      if(activeStyles[entity]) {
        // do style stuff
        let style = activeStyles[entity].style;
        if(!additions[entity] || !additions[entity][attribute]) {
          style[attribute] = "";
        }
      } else if(activeElements[entity]) {
        let elem = activeElements[entity];
        switch(attribute) {
          case "tag":
            if(supportedTags[value]) {
              //nuke the whole element
              elem.parentNode.removeChild(elem);
              activeElements[entity] = null;
            }
            break;
          case "style":
            stylesToGC.push(value);
            break;
          case "children":
            let child = activeElements[value];
            if(child) {
              elem.removeChild(child);
              activeElements[value] = null;
            }
            break;
          case "text":
            if(!additions[entity] || !additions[entity]["text"]) {
              elem.textContent = "";
            }
            break;
          default:
            if(!additions[entity] || !additions[entity][attribute]) {
              //FIXME: some attributes don't like getting set to undefined...
              elem[attribute] = undefined;
            }
            break;
        }
      }
    }
    // clean up any styles that need to go
    for(let styleId of stylesToGC) {
      activeStyles[styleId] = null;
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
          let childElem = activeElements[child];
          if(childElem) {
            insertSorted(elem, childElem)
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
        insertSorted(parent, elem);
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


var socket = new WebSocket("ws://" + window.location.host +"/ws");
socket.onmessage = function(msg) {
  console.log(msg)
  let data = JSON.parse(msg.data);
  if(data.type == "result" && data.id == "ui-query") {
    denormalizeResult(data);
  }
}
socket.onopen = function() {
  console.log("Connected to eve server!");
  //TODO: open the ui query
  socket.send(JSON.stringify({id: "ui-query", type: "query", query: `
get all the ui facts
  (entity, attribute, value) =
    if entity = [#html]
       [#eavs entity attribute value] then (entity, attribute, value)
    if [#html style]
       [#eavs entity: style, attribute value] then (style, attribute, value)
  update session
    [#eavs entity attribute value]

mark all the different tag types as html
  entity = if e = [#div] then e
           if e = [#span] then e
           if e = [#ul] then e
           if e = [#ol] then e
           if e = [#li] then e
  update entity := [#html]
  `}));
}

// denormalizeResult({insert: [["foo", "tag", "div"], ["foo", "children", "bar"], ["foo", "children", "woot"], ["bar", "tag", "span"], ["bar", "style", "bar-style"], ["bar-style", "color", "red"], ["bar", "text", "meh"], ["woot", "tag", "span"], ["woot", "text", "ZOMG"]], remove: []})
// denormalizeResult({insert: [["woot", "text", "ya wai"], ["woot", "style", "woot-style"], ["woot-style", "background", "blue"], ["bar", "text", "no wai"]], remove: []})
