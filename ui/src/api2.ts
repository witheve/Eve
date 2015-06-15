module api2 {
  declare var uuid;
  declare var api;
  var ixer = api.ixer;
  var code = api.code;
  var clone = api.clone;
  
  type Id = string;
  type Fact = string[];
  
  class NotFoundError implements Error {
    public name: string = "Not Found"
    public message:string
    constructor(kind:string, ...ids:Id[]) {
      this.message = kind + " " + ids.join(" :: ") + " does not exist in the indexer.";
    }
  }
  
  enum ViewKind {
    TABLE = <any>"table",
    JOIN = <any>"join",
    UNION = <any>"union",
    AGGREGATE = <any>"aggregate",
    PRIMITIVE = <any>"primitive"
  }
  
  enum FieldKind {
    OUTPUT = <any>"output",
    SCALAR = <any>"scalar input",
    VECTOR = <any>"vector input"
  }
  
  type Diff = any[];
  
  interface FactMap {}
  interface Dependents {}
  interface PKDependents extends Dependents {name?: string, priority?: number, tags?: string[]}
  interface FullPKDependents extends Dependents {name?: {id:Id, name:string}, priority?: {id:Id, priority:number}, tags?: {id:Id, tag:string}[]}
  interface AggregateDependents {groupings?: AggregateGrouping[], sortings?: AggregateSorting[], from?: AggregateLimitFrom, to?: AggregateLimitTo}
  interface ViewDependents extends PKDependents, AggregateDependents {sources?: Source[], block?: Block}
  interface SourceDependents extends Dependents {constraints?: Constraint[]}
  interface FieldDependents extends PKDependents {selects?: Select[]}
  
  interface Block extends FactMap {query: number, block?: Id, view?: Id, dependents?:PKDependents}
  interface View extends FactMap {view?: Id, kind: ViewKind, dependents?:ViewDependents}
  interface Source extends FactMap {view: Id, source?: Id, "source view": Id, dependents?:SourceDependents}
  interface Field extends FactMap {view: Id, field?: Id, kind: FieldKind, dependents?:FieldDependents}
  interface Select extends FactMap {view: Id, "view field"?: Id, source: Id, "source field": Id}
  interface Constraint {view?: Id, leftSource?: Id, leftField?: Id, rightSource?: Id, rightField?: Id, operation?: Id} // @TODO: rename leftSource -> left source, etc.
  interface AggregateGrouping {aggregate?: Id, "inner field": Id, "outer field": Id}
  interface AggregateSorting {aggregate?: Id, "inner field": Id, priority: number, direction: string}
  interface AggregateLimitFrom {aggregate?: Id, "from source": Id, "from field": Id}
  interface AggregateLimitTo {aggregate?: Id, "to source": Id, "to field": Id}
  
  interface Context {[key:string]: Id}
  interface Write<T> {type: string, params: T, context: Context}
  
  var primaryKeys = {
    block: "block",
    view: "view",
    source: ["view", "source"],
    field: "field",
    constraint: "constraint"
  };
  
  interface Schema {
    key?: string|string[]
    dependents?: Id[]
    foreign?: {[field:string]: string},
    special?: (type:string, params, context: Context) => Write<any>
  }
  
  var pkDependents = ["name", "order", "tag"];
  var schemas:{[id:string]: Schema} = {
    "display name": {foreign: {id: "$last"}},
    "display order": {foreign: {id: "$last"}},
    tag: {foreign: {view: "$last"}},
    
    block: {key: "block",
            foreign: {view: "view"},
            dependents: pkDependents},
    view: {key: "view",
           dependents: pkDependents.concat(
             ["block", "field", "aggregate grouping", "aggregate sorting", "aggregate limit from", "aggregate limit to"])},
    source: {key: ["view", "source"],
             foreign: {view: "view"},
             dependents: ["constraint"]},
    field: {key: "field",
            foreign: {view: "view"},
            dependents: pkDependents.concat(["select"])},
    select: {key: undefined,
             foreign: {view: "view", field: "field"}},
    constraint: {key: "constraint", foreign: {view: "view"}}
  }
  
  export function process(type:string, params, context?:Context): Write<any> {
    console.log("[process]", type, params, context);
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to process unknown type " + type + " with params " + params); }
    if(!params) { throw new Error("Invalid params specified for type " + type + " with params " + params); }
    if(!context) { context = {}; } // @NOTE: Should we clone this? If so, should we clone params as well?
    
    // Fill primary keys if missing.
    var keys:string[] = [];
    if(schema.key instanceof Array) { keys = <string[]>schema.key; }
    else if(schema.key) { keys = [<string>schema.key]; }
    for(var key of keys) {
      if(params[key] === undefined) {
        params[key] = uuid();
      }
      context[key] = params[key];
    }
    if(keys.length === 1) {
      context["$last"] = params[keys[0]];
    }
    
    // Link foreign keys from context if missing.
    var links:string[] = [];
    if(schema.foreign) {
      for(var fKey in schema.foreign) {
        if(!schema.foreign.hasOwnProperty(fKey)) { continue; }
        if(params[fKey] !== undefined) { continue; }
        var contextKey = schema.foreign[fKey];
        console.log(fKey, contextKey, context[contextKey]);
        if(!context[contextKey]) { throw new Error("Unspecified field " + fKey + " for type " + type + " with no compatible parent to link to."); }
        params[fKey] = context[contextKey];
      }
    }
    
    // Ensure remaining fields exist and contain something.
    var fieldIdIx = code.ix("field", "field");
    var fields = ixer.index("view to fields")[type] || [];
    for(var field of fields) {
      var fieldName = code.name(field[fieldIdIx]);
      if(params[fieldName] === undefined || params[fieldName] === null) {
        throw new Error("Missing value for field " + fieldName + " on type " + type);
      }
    }
    
    // Process dependents recursively.
    if(params.dependents) {
      var dependents = params.dependents;
      for(var dep in dependents) {
        if(!dependents.hasOwnProperty(dep)) { continue; }
        if(dependents[dep] instanceof Array) {
          for(var depItem of dependents[dep]) {
            process(dep, depItem, context);
          }  
        } else {
          process(dep, dependents[dep], context);
        }
      } 
    }
    
    return {type: type, params: params, context: context};
  }
  
  export function retrieve(type:string, ...ids:Id[]):Write<any> {
    console.log("[retrieve]", type, ids);
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to retrieve unknown type " + type + " with params " + params); }
    var keys = [];
    if(schema.key instanceof Array) { keys = <string[]>schema.key; }
    else if(schema.key) { keys.push(schema.key); }
    
    if(!ids || !ids.length || ids.length !== keys.length) {
      throw new Error("Must provide primary keys for type " + type + " (" + keys.join(", ") + ")");
    }
    
    var fact = ixer.index(type);
    for(var key of keys) {
      if(fact) {
        fact = fact[key];
      }
    }
    if(!fact) { throw new NotFoundError(type, ids.join(", ")); }
    var params:any = factToMap(type, fact);
    params.dependents = {};
    if(schema.dependents) {
      for(var dependent of schema.dependents) {
        var depSchema = schemas[dependent];
        // @FIXME: Update references to ensure order is source -> field not field -> source.
        var foreignField = depSchema.foreign[type];
        var q = {};
        q[foreignField] = params[schema.key]; // @TODO: Ensure key is singular here.
        var results = query("dependent", q); // @TODO: Determine whether relationship is 1:1 or 1:many for query or queryOne.
        if(results) {
          params.dependents[dependent] = results;
        }
      }
    }
    var write:Write<any> = {type: type, params: params, context: {}};
    return write;
  }
  



  function mapToFact(viewId:Id, props:FactMap) {
    var fieldIds = code.sortedViewFields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var fact = new Array(length);
    for(var ix = 0; ix < length; ix++) {
      var name = code.name(fieldIds[ix]);
      var val = props[name];
      if(val === undefined || val === null) { throw new Error("Malformed value in " + viewId + " fact " + JSON.stringify(props)); }
      fact[ix] = val;
    }
    return fact;
  }
  
  function factToMap(viewId:Id, fact:Fact) {
    var fieldIds = code.sortedViewFields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var map = {};
    for(var ix = 0; ix < length; ix++) {
      var name = code.name(fieldIds[ix]);
      map[name] = fact[ix];
    }
    return map;
  }
  
  // @FIXME: CLEAR ALL OTHER DEPENDENTS ON UPDATE OF ROOT.
  function addToDiffs(type:string, params, mode = "inserted"):Diff[] {
    var dependents = params.dependents || {};
    var facts = [];
    
    // Process root fact.
    facts.push([type, mode, mapToFact(type, params)]);

    // Process dependents.
    for(var key of dependents) {
      if(!dependents.hasOwnProperty(key)) { continue; }
      if(dependents[key] instanceof Array) {
        for(var dep of dependents[key]) {
          facts = facts.concat(addToDiffs(key, dep, mode));
        }
      } else {
        facts = facts.concat(addToDiffs(key, dependents[key], mode));
      }
    }
    
    // Handle custom dependents.
    switch(type) {
      case "constraint":
        facts.push(["constraint left", mode, mapToFact("constraint left", params)],
                   ["constraint right", mode, mapToFact("constraint right", params)],
                   ["constraint operation", mode, mapToFact("constraint operation", params)]);
      break;
    }
    
    return facts;
  }
  
  function remove(type:string, ...ids:Id[]) {
    switch(type) {
      
    }
  }
}