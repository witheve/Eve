import {Change, Prefix, EvaluationContext, GlobalInterner} from "./runtime";
import {Renderer} from "../microReact";

//------------------------------------------------------------------------
// UI helpers
//------------------------------------------------------------------------

function handleArgs(args:any[]) {
  if(typeof args[0] === "object" && args[0].constructor !== Array) return args;
  args.unshift({});
  return args;
}

function $row(...args:any[]) {
  let [elem, children] = handleArgs(args);
  elem.t = "row";
  elem.children = children;
  return elem;
}

function $col(...args:any[]) {
  let [elem, children] = handleArgs(args);
  elem.t = "column";
  elem.children = children;
  return elem;
}

function $text(...args:any[]) {
  let [elem, text] = handleArgs(args);
  elem.t = "text";
  elem.text = text;
  return elem;
}

function $button(...args:any[]) {
  let [elem, click, content] = handleArgs(args);
  elem.t = "button";
  if(typeof content === "string") {
    elem.text = content;
  } else {
    elem.children = [content];
  }
  elem.click = click;
  return elem;
}

function $spacer(...args:any[]) {
  let [elem] = handleArgs(args);
  elem.t = "spacer";
  return elem;
}

//------------------------------------------------------------------------
// Tracer
//------------------------------------------------------------------------

export enum TraceNode {
  Join,
  Choose,
  Union,
  BinaryJoin,
  AntiJoin,
  AntiJoinPresolvedRight,
  Output,
  Watch,
}

export enum TraceFrameType {
  Program,
  Transaction,
  Input,
  Block,
  Node,
  MaybeOutput,
  MaybeExternalInput,
}

let typeToParentField = {
  [TraceFrameType.Transaction]: "transactions",
  [TraceFrameType.Input]: "inputs",
  [TraceFrameType.Block]: "blocks",
  [TraceFrameType.Node]: "nodes",
  [TraceFrameType.MaybeOutput]: "outputs",
  [TraceFrameType.MaybeExternalInput]: "externalInputs",
}

interface Frame {type:TraceFrameType};
interface ProgramFrame extends Frame {transactions: TransactionFrame[]}
interface TransactionFrame extends Frame {id:number, externalInputs:any[], inputs:any[]}

export class Tracer {
  stack:any[] = [{type:TraceFrameType.Program, transactions: []}];
  _currentInput:Change|undefined;
  inputsToOutputs:any = {};
  outputsToInputs:any = {};
  eToChange:any = {};
  renderer:Renderer;

  constructor(public context:EvaluationContext) {
    if(typeof window !== "undefined") {
      let renderer = this.renderer = new Renderer();
      document.body.appendChild(renderer.content);
    }
  }

  changeKey(change:Change) {
    let {e,a,v,n,round,transaction,count} = change;
    return `${e}|${a}|${v}|${n}|${round}|${transaction}|${count}`;
  }

  current() {
    return this.stack[this.stack.length - 1];
  }

  transaction(id:number) {
    this.stack.push({type:TraceFrameType.Transaction, id, externalInputs: [], inputs: []})
  }

  frame(commits:Change[]) {
    // @TODO
  }

  indexChange(change:Change) {
    let found = this.eToChange[change.e];
    if(!found) found = this.eToChange[change.e] = [];
    found.push(change);
  }

  input(input:Change) {
    this._currentInput = input;
    this.indexChange(input);
    this.stack.push({type:TraceFrameType.Input, input, blocks: []})
  }

  block(name:string) {
    this.stack.push({type:TraceFrameType.Block, name, nodes: []})
  }

  node(nodeType:TraceNode, inputPrefix:Prefix) {
    this.stack.push({type:TraceFrameType.Node, nodeType:nodeType, inputPrefix, nodes: [], prefixes: [], outputs: [], commits: []})
  }

  capturePrefix(prefix:Prefix) {
    let parent = this.current();
    parent.prefixes.push(prefix.slice());
  }

  _mapOutput(output:Change) {
    let {_currentInput} = this;
    if(_currentInput) {
      let outKey = this.changeKey(output);
      let inKey = this.changeKey(_currentInput);
      this.outputsToInputs[outKey] = _currentInput;
      let inList = this.inputsToOutputs[inKey];
      if(!inList) inList = this.inputsToOutputs[inKey] = [];
      inList.push(output);
    }
  }

  maybeOutput(change:Change) {
    // this._mapOutput(change);
    let cur = this.current();
    let type = TraceFrameType.MaybeOutput;
    if(cur.type === TraceFrameType.Transaction) {
      type = TraceFrameType.MaybeExternalInput;
    }
    let counts = (this.context.distinctIndex.getCounts(change) || []).slice();
    this.stack.push({type, distinct: {pre: counts, post: undefined}, change, outputs: []})
  }

  postDistinct() {
    let cur = this.current();
    let counts = this.context.distinctIndex.getCounts(cur.change)!.slice();
    cur.distinct.post = counts;
  }

  output(output:Change) {
    this._mapOutput(output);
    let parent = this.current();
    parent.outputs.push(output);
  }

  commit(commit:Change) {
    this._mapOutput(commit);
    let parent = this.current();
    parent.commits.push(commit);
  }

  pop(type:TraceFrameType) {
    let {stack} = this;
    let cur = stack.pop();
    if(cur.type !== type) {
      if(cur.type !== TraceFrameType.MaybeExternalInput || type !== TraceFrameType.MaybeOutput) {
        throw new Error(`Popping the wrong type! expected: ${TraceFrameType[type]}, actual: ${TraceFrameType[cur.type]}`)
      }
    }
    let parent = this.current();
    if(!parent) {
      throw new Error("Removed everything from the stack");
    }
    if(cur.type === TraceFrameType.Transaction) {
      parent = this.stack[0];
    }

    let field = typeToParentField[cur.type];
    if(!parent[field]) throw new Error(`Trying to write trace field '${field}', but ${TraceFrameType[parent.type]} doesn't have it`);
    parent[field].push(cur);
    if(cur.type === TraceFrameType.Input) this._currentInput = undefined;
    if(cur.type === TraceFrameType.Transaction) {
      this.draw();
    }
  }

  //------------------------------------------------------------------------
  // UI
  //------------------------------------------------------------------------

  activeSearch:string = "";
  activeInput:Change|undefined;

  draw() {
    let {renderer} = this;
    if(!renderer) return;
    renderer.render([this.$interface()])
  }

  $interface = () => {
    let program = this.stack[0];
    return $row({c: "trace"}, [
      this.$searcher(program),
      this.$visualization(program)
    ])
  }

  makeSearch = (query:string) => {
    let [e,a,v] = query.split(",").map((v) => v.trim());
    let conditions = [];
    if(e && e !== "?") {
      conditions.push(`input.e == ${+e}`);
    }
    if(a && a !== "?") {
      conditions.push(`input.a === ${GlobalInterner.intern(a)}`);
    }
    if(v && v !== "?") {
      if(this.eToChange[+v]) {
        conditions.push(`input.v == ${+v}`);
      } else {
        conditions.push(`input.v == ${GlobalInterner.intern(isNaN(+v) ? v : +v)}`);
      }
    }
    if(!conditions.length) {
      conditions.push("true");
    }
    return new Function("input", `return ${conditions.join(" && ")}`) as (input:Change) => boolean;
  }

  inSearch = (input:Change) => {
    return true;
  }

  $searcher = (program:ProgramFrame) => {
    let inputs = [];
    for(let transaction of program.transactions) {
      for(let input of transaction.inputs) {
        if(this.inSearch(input.input)) {
          inputs.push(this.$changeLink(input.input));
        }
      }
    }
    return $col({c: "searcher"}, [
      {t: "input", type: "text", placeholder:"search", keydown: (e:any) => {
        if(e.keyCode === 13) {
          this.activeSearch = e.target.value.trim();
          this.inSearch = this.makeSearch(this.activeSearch);
          this.draw();
        }
      }},
      $col(inputs)
    ])
  }

  $visualization = (program:ProgramFrame) => {
    let {$changeLink, activeInput} = this;
    if(activeInput) {
      let key = this.changeKey(activeInput);
      let from = this.outputsToInputs[key];
      let to = this.inputsToOutputs[key];
      let fromInfo;
      if(from) {
        fromInfo = $col([
          $text("generated by: "),
          $changeLink(from),
        ]);
      } else {
        fromInfo = $col([
          $text("generated by: "),
          $text("unknown"),
        ]);
      }
      let toInfo;
      if(to) {
        toInfo = $col([
          $text("causes output:"),
          $col(to.map($changeLink)),
        ]);
      }
      return $col([
        $changeLink(activeInput),
        fromInfo,
        toInfo,
      ])
    }
    return $text("select an input");
    // return $col({c: "program"}, program.transactions.map(this.$transaction));
  }

  $transaction = (trans:TransactionFrame) => {
    let {$changeLink} = this;
    let inputs = [];
    for(let input of trans.externalInputs) {
      inputs.push($changeLink(input.change));
    }
    let outputs = [];
    for(let input of trans.inputs) {
      for(let block of input.blocks) {
        for(let output of block.nodes[block.nodes.length - 1].outputs) {
          outputs.push($text(output.toString()));
        }
      }
    }
    return $col([
      $text(`Transaction ${trans.id}`),
      $col([
        $text("inputs:"),
        $col(inputs),
        $text("outputs:"),
        $col(outputs),
      ])
    ])
  }

  setLink = (e:any, elem:any) => {
    this.activeInput = elem.input;
    this.draw();
  }

  $changeLink = (change:Change) => {
    let {e,a,v}:any = change;
    a = GlobalInterner.reverse(a);
    v = GlobalInterner.reverse(v);
    if(typeof v === "string" && (v.indexOf("|") > -1 || (v[8] === "-" && v.length === 36))) {
      v = change.v;
    }
    return $button({c: "change-link", input:change}, this.setLink, $row([
      $text(`${e}, ${a}, ${v}`),
      $spacer(),
      $text(` [${change.transaction}, ${change.round}, ${change.count}]`),
    ]));
  }
}




