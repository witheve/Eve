//---------------------------------------------------------------------
// Utility functions for working with triples
//---------------------------------------------------------------------

import {Changes} from "../changes";
import {TripleIndex} from "../indexes";

//---------------------------------------------------------------------
// JS conversion
//---------------------------------------------------------------------

export function fromJS(changes: Changes, json: any, node: string, scope: string, idPrefix: string = "js") {
  if(json.constructor === Array) {
    let arrayId = `${idPrefix}|array`;
    changes.store(scope, arrayId, "tag", "array", node);
    let ix = 0;
    for(let value of json) {
      ix++;
      if(typeof value === "object") {
        value = fromJS(changes, value, node, scope, `${arrayId}|${ix}`);
      }
      changes.store(scope, arrayId, ix, value, node);
    }
    return arrayId;
  } else if(typeof json === "object") {
    let objectId = `${idPrefix}|object`;
    for(let key of Object.keys(json)) {
      let value = json[key];
      if(value !== null && (value.constructor === Array || typeof value === "object")) {
        value = fromJS(changes, value, node, scope, `${objectId}|${key}`);
      }
      changes.store(scope, objectId, key, value, node);
    }
    return objectId;
  } else {
    throw new Error("Trying to turn non-object/array JSON into EAVs." + JSON.stringify(json));
  }
}

export function toJS(index: TripleIndex, recordId) {
  let result;
  let isArray = index.lookup(recordId, "tag", "array");
  if(isArray !== undefined) {
    result = [];
    let ix = 1;
    while(true) {
      let valueIndex = index.lookup(recordId, ix);
      if(valueIndex !== undefined) {
        let curIndex = valueIndex.index;
        for(let key of Object.keys(curIndex)) {
          let value = curIndex[key].value;
          if(index.lookup(value)) {
            result[ix - 1] = toJS(index, value);
          } else {
            result[ix - 1] = value;
          }
        }
      } else {
        break;
      }
      ix++;
    }
  } else {
    result = index.asObject(recordId);
    for(let key of Object.keys(result)) {
      let values = result[key];
      let valueIx = 0;
      for(let value of values) {
        if(index.lookup(value)) {
          values[valueIx] = toJS(index, value);
        } else {
          values[valueIx] = value;
        }
        valueIx++;
      }
      if(values.length === 1) {
        result[key] = values[0];
      }
    }
  }
  return result;
}
