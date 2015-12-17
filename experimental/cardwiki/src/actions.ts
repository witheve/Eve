declare var uuid;
import {parse as marked} from "../vendor/marked";
import {Indexer}  from "./runtime";
import {eve, render} from "./app";

interface Collection {
  id: string;
  content?: string;
  attributes: string[];
}

interface Action {
  inputs: string[];
  outputs: string[];
  triggers?: {[collectionId: string]: (ixer:Indexer) => void};
  triggerAttributes?: {[collectionId: string]: string[]};
  content?: string;
}


let actions:{[id:string]: Action} = {};

function titlecase(str:string) {
  return str.split(" ").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function autoContent(id:string, action:string) {
  return `
    # ${titlecase(id)}
    ${id[0].toUpperCase() + id.slice(1)} is an auto-generated collection that is used by {action: ${action}}.

    @TODO: Show contents via projection
  `;
}

export function add(id:string, action:Action) {
  if(actions[id]) {
    console.warn(`Overwriting existing action for id: '${id}'.`);
    remove(id);
  }
  actions[id] = action;

  let changeset = eve.diff();
  changeset.add("action entity", {entity: id, content: action.content || ""});
  for(let input of action.inputs) {
    changeset.add("action entity", {entity: input, content: autoContent(input, id)});
  }
  for(let output of action.outputs) {
    changeset.add("action entity", {entity: output, content: autoContent(output, id)});
  }
  console.log(changeset);
  eve.applyDiff(changeset);

  for(let trigger in action.triggers) {
    let queryId = `${id}|${trigger}`;
    let query = eve.query(queryId)
      .select("collection entities", {collection: trigger}, "coll");
    let projectionMap = {};
    for(let attr of action.triggerAttributes[trigger]) {
      query.select("entity eavs", {entity: ["coll", "entity"], attribute: attr}, attr);
      projectionMap[attr] = [attr, "value"];
    }
    query.project(projectionMap);
    eve.asView(query);
    eve.trigger(queryId + "-trigger", queryId, action.triggers[trigger]);
  }
}
export function remove(id:string) {
  if(!actions[id]) return;
  let action = actions[id];
  delete actions[id];

  let changeset = eve.diff();
  changeset.remove("action entity", {entity: id, source: id});
  for(let input of action.inputs) changeset.remove("action entity", {entity: input, source: id});
  for(let output of action.outputs) changeset.remove("action entity", {entity: output, source: id});
  eve.applyDiff(changeset);
}

export function get(id:string) {
  return actions[id];
}

add("marked", {
  inputs: ["markdown input"],
  outputs: ["markdown"],
  triggerAttributes: {
    "markdown input": ["md"]
  },
  triggers: {
    "markdown input": function() {
      let changeset = eve.diff();
      let actionId = "marked";
      let existingEntities = [];
      let inputs = eve.find(`${actionId}|markdown input`);

      // we want to add an attribute, not create an entity

      for(let input of inputs) {
        let entityId = `markdown ${input.md}`;
        existingEntities.push(entityId);
        if(eve.findOne("action entity", {entity: entityId, source: "marked"})) continue;
        changeset.add("action entity", {entity: entityId, source: "marked", content: `
          ${marked(input.md)}
        `});
      }
      for(let entity of eve.find("action entity", {source: "marked"})) {
        if(existingEntities.indexOf(entity.entity) === -1) changeset.remove("action entity", {entity: entity.entity});
      }
      eve.applyDiff(changeset);
      // @FIXME: When diffs are available to properly execute, implement a post-fixpoint trigger for actions.
      render();
    }
  }
});
