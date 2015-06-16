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
    foreign?: {[field:string]: string}
    singular?: boolean
  }
  
  var pkDependents = ["display name", "display order", "tag"];
  var schemas:{[id:string]: Schema} = {
    "display name": {foreign: {$last: "id"},
                     singular: true},
    "display order": {foreign: {$last: "id"},
                      singular: true},
    tag: {foreign: {$last: "view"}},
    
    block: {key: "block",
            foreign: {view: "view"},
            singular: true,
            dependents: pkDependents},
    view: {key: "view",
           dependents: pkDependents.concat(
             ["block", "field", "aggregate grouping", "aggregate sorting", "aggregate limit from", "aggregate limit to"])},
    source: {key: ["view", "source"],
             primaryIx: 1,
             foreign: {view: "view"},
             dependents: ["constraint"]},
    field: {key: "field",
            foreign: {view: "view"},
            dependents: pkDependents.concat(["select"])},
    select: {foreign: {view: "view", field: "view field"}},
    constraint: {key: "constraint", foreign: {view: "view"}},
    
    "aggregate grouping": {foreign: {view: "aggregate", /*field: "inner field"*/}},
    "aggregate sorting": {foreign: {view: "aggregate", /*field: "inner field"*/}},
    "aggregate limit from": {foreign: {view: "aggregate"},
                             singular: true},
    "aggregate limit to": {foreign: {view: "aggregate"},
                           singular: true},
                           
     "text input": {},
  };
  
  
  /***************************************************************************\
   * Helper Functions
  \***************************************************************************/
  function mapToFact(viewId:Id, props:FactMap) {
    var fieldIds = code.sortedViewFields(viewId); // @FIXME: We need to cache these horribly badly.
    var length = fieldIds.length;
    var fact = new Array(length);
    for(var ix = 0; ix < length; ix++) {
      var name = code.name(fieldIds[ix]);
      var val = props[name];
      if(val === undefined || val === null) {
        throw new Error("Malformed value in " + viewId + " for field " + name + " of fact " + JSON.stringify(props));
      }
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
  export function toDiffs(type:string, params, mode = "inserted"):Diff[] {
    var diffs = [];
    if(params instanceof Array) {      
      for(var item of params) {
        diffs = diffs.concat(toDiffs(type, item, mode));
      }
      return diffs;
    }
    
    // Process root fact.
    diffs.push([type, mode, mapToFact(type, params)]);

    // Process dependents.
    var dependents = params.dependents || {};
    for(var key in dependents) {
      if(!dependents.hasOwnProperty(key)) { continue; }
      if(dependents[key] instanceof Array) {
        for(var dep of dependents[key]) {
          diffs = diffs.concat(toDiffs(key, dep, mode));
        }
      } else {
        diffs = diffs.concat(toDiffs(key, dependents[key], mode));
      }
    }
    
    // Handle custom dependents.
    switch(type) {
      case "constraint":
        diffs.push(["constraint left", mode, mapToFact("constraint left", params)],
                   ["constraint right", mode, mapToFact("constraint right", params)],
                   ["constraint operation", mode, mapToFact("constraint operation", params)]);
      break;
    }
    
    return diffs;
  }
  
  function fillForeignKeys(type, query, context) {
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to process unknown type " + type + " with query " + JSON.stringify(query)); }
    var foreignKeys = schema.foreign;
    if(!foreignKeys) { return query; }
    
    for(var contextKey in foreignKeys) {
      var foreignKey = foreignKeys[contextKey];
      if(!foreignKeys.hasOwnProperty(contextKey)) { continue; }
      if(query[foreignKey] !== undefined) { continue; }
      if(context[contextKey] === undefined) {
        throw new Error("Unspecified field " + foreignKey + " for type " + type + " with no compatible parent to link to in context " + JSON.stringify(context));
      }
      query[foreignKey] = context[contextKey];
    }
    return query;
  }
  
  
  /***************************************************************************\
   * Read/Write API
  \***************************************************************************/
  export function insert(type:string, params, context?:Context) {
    return process(type, params, context).params;
  } 
  
  export function process(type:string, params, context?:Context): Write<any> {
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to process unknown type " + type + " with params " + JSON.stringify(params)); }
    if(!params) { throw new Error("Invalid params specified for type " + type + " with params " + JSON.stringify(params)); }
    if(!context) { context = {}; } // @NOTE: Should we clone this? If so, should we clone params as well?
    
    // Fill primary keys if missing.
    var keys:string[] = (schema.key instanceof Array) ? <string[]>schema.key : (schema.key) ? [<string>schema.key] : [];
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
    if(schema.foreign) {
      var params = fillForeignKeys(type, params, context);
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
  
  export function retrieve(type:string, query:{[key:string]:string}, context?) {
    context = context || {};
    var schema = schemas[type];
    if(!schema) { throw new Error("Attempted to retrieve unknown type " + type + " with params " + JSON.stringify(query)); }
    var keys:string[] = (schema.key instanceof Array) ? <string[]>schema.key : (schema.key) ? [<string>schema.key] : [];    
        
    var facts = ixer.select(type, query);
    if(!facts.length) { return; }
    for(var fact of facts) {
      if(!fact) { continue; }
      var factContext = clone(context);
      for(var key of keys) {
        factContext[key] = fact[key];
      }
      if(keys.length === 1) {
        factContext["$last"] = fact[keys[0]];
      }
      
      var dependents = {};
      var hasDependents = false;
      if(schema.dependents) {
        for(var dependent of schema.dependents) {
          var depSchema = schemas[dependent];
          
          //debugger;
          var q = <{[key:string]:string}>fillForeignKeys(dependent, {}, factContext);
          
          var results = retrieve(dependent, q, clone(factContext));
          if(results && results.length) {
            if(depSchema.singular) {
              dependents[dependent] = results[0];
            } else {
              dependents[dependent] = results;
            }
            hasDependents = true;
          }
        }
      }
      if(hasDependents) {
        fact.dependents = dependents;
      }
    }
    
    return facts;
  }
  




}