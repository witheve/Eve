/// <reference path="../vendor/cola.d.ts" />
module MicroReactStyleLayoutAdapter {
  interface MicroReactLayoutAdaptorSettings {
    animate: boolean
    msPerTick: number
    stepsPerTick: number
    ticksPerFrame: number 
  }
 
  export let defaultSettings = {
    animate: false,    // Continuously render graph during layout process.
    msPerTick: 0,    // Milliseconds per simulation tick.
    stepsPerTick: 8,  // Iterations per simulation tick. 
    ticksPerFrame: 4, // Steps per render if animating.
  }
  
  export class MicroReactLayoutAdaptor extends cola.LayoutAdaptor {
    adaptor:cola.LayoutAdaptor
    settings:MicroReactLayoutAdaptorSettings
    _handlers:{[event:string]: ((evt?:any) => void)[]} = {};
    frameClock:number = 0
    
    constructor(opts?) {
      super(opts || {});
      let settings = opts || {};
      for(let key in defaultSettings) {
        if(settings[key] === undefined) { settings[key] = defaultSettings[key]; }
      }
      this.settings = settings;
    }
    
    // Used by cola to notify layout of updates.
    trigger(evt:cola.Event) {
      switch(evt.type) {
        case cola.EventType.end:
          this.render();
          break;
      }
    }
    
    dispatch(evt:{type:string, [props:string]:any}) {
      for(let handler of this._handlers[evt.type] || []) {
        handler(evt);
      }
    }
    
    on(eventType:cola.EventType|string, listener: (evt?:any) => void) : MicroReactLayoutAdaptor {
      if(!this._handlers[eventType]) { this._handlers[eventType] = []; }
      if(this._handlers[eventType].indexOf(listener) === -1) {
        this._handlers[eventType].push(listener);
      }
      return this;
    }
    
    off(eventType:cola.EventType|string, listener?: (evt?:any) => void) : MicroReactLayoutAdaptor {
      if(!listener) {
        this._handlers[eventType] = [];
      } else {
        let ix = this._handlers[eventType].indexOf(listener);
        if(ix !== -1) {
          this._handlers[eventType].splice(ix, 1);  
        }
      }
      return this;
    }

    kick() {
      while(!this.tick()) {}
      return true;
    }
    
    drag() {}
    
    render() {
      this.dispatch({type: "render", nodes: this.nodes(), edges: this.links()});
    }
  }
}

module datawang {
  let seed = 1;
  let nid = 0;
  
  interface Node {
    id: string
    index: number
    x?: number
    y?: number
    width?: number
    height?: number
    kind?: any
  }
  
  interface Edge {
    source: number,
    target: number
  }
  
  export function reset() {
    nid = 0;
  }
  
  // courtesy of <http://stackoverflow.com/a/19303725>
  export function srand() {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
  }
  
  export function chooseInt(min:number, max:number):number {
    return min + Math.floor(srand() * (max - min));
  }
  
  export function choose<T>(choices:T[]): T {
    return choices[chooseInt(0, choices.length)];
  }
  
  export function genNodes(num:number, offset:number = 0):Node[] {
    let nodes:Node[] = [];
    for(let ix = nid; ix < num + nid; ix++) {
      nodes.push({
        id: "node-" + (ix + offset),
        index: ix + offset,
        width: Math.floor(srand() * 8) * 10 + 40,
        height: Math.floor(srand() * 8) * 10 + 20
      });
    }
    nid += num;
    return nodes;
  }
  export function genEdges(num:number, sources:Node[], targets:Node[], existing:Edge[] = []):Edge[] {
    let edges:Edge[] = [];
    let usedEdges = {};
    for(let edge of existing) {
      if(!usedEdges[edge.source]) { usedEdges[edge.source] = []; }
       usedEdges[edge.source].push(edge.target);
    }
    let tries = 0;
    for(let ix = 0; ix < num; ix++) {
      let src = choose(sources);
      let dest = choose(targets);
      if(src.index === dest.index || (usedEdges[src.index] && usedEdges[src.index].indexOf(dest.index) !== -1)) {
        if(tries > 100) { throw new Error(`Cannot join ${ix} of ${num} edges from ${sources.length} to ${targets.length} stochastically, bailing.`); }
        ix--;
        tries++;
        continue;
      }
      tries = 0;
      if(!usedEdges[src.index]) { usedEdges[src.index] = []; }
      usedEdges[src.index].push(dest);
      edges.push({source: src.index, target: dest.index});
    }
    return edges;
  }
  
  export function genData(sourceCount:number, attrCount:number, joinCount:number) {
    let sources = genNodes(sourceCount).map(function(node) {
      node.kind = "source";
      return node;
    });
    let attrs = genNodes(attrCount);
    let edges:Edge[] = [];
    
    for(let dest of attrs) {
      let src = choose(sources);
      edges.push({source: src.index, target: dest.index});
    }
    let joins = genEdges(joinCount, sources, attrs, edges);
    
    return {nodes: sources.concat(attrs), edges: edges.concat(joins)};
  }
}

module test {

  
  let start;
  let _adaptor;
  let _nodes;
  let _edges;
  
  function renderToCanvas(evt) {
    console.log("[render]", Date.now() - start, "ms");
    let nodes = evt.nodes;
    let cvs = <HTMLCanvasElement>document.getElementById("canvas");
    let ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = "#3366CC";
    for(let node of nodes) {
      ctx.fillStyle = `hsla(${Math.floor(360*node.index / nodes.length)}, 50%, 30%, 0.5)`;
      ctx.fillRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height);
      if(node.kind === "source") {
        ctx.strokeRect(node.x - node.width / 2, node.y - node.height / 2, node.width, node.height);
      }
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillText(node.id, node.x - node.width / 2 + 4, node.y - node.height / 2 + 12);
    }
    
    ctx.strokeStyle = "#FFF";
    for(let edge of evt.edges) {
      ctx.beginPath();
      let source = nodes[edge.source.index];
      let target = nodes[edge.target.index];
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.closePath();
    }
  }
  
  
  export function go() {
    let adaptor = new MicroReactStyleLayoutAdapter.MicroReactLayoutAdaptor();
    adaptor.size([960, 958]);
    //adaptor.symmetricDiffLinkLengths(75, 0.25);
    adaptor.jaccardLinkLengths(100, 0.5);
    //adaptor.handleDisconnected(true);
    adaptor.avoidOverlaps(true);
    adaptor.on("render", renderToCanvas);
    window['a'] = _adaptor = adaptor;
    
    datawang.reset();
    let testData = datawang.genData(4, 12, 3);
    _nodes = testData.nodes;
    _edges = testData.edges;
    console.log("data", testData);
    
    adaptor.nodes(<any>_nodes);
    adaptor.links(<any>_edges);
    
    start = Date.now();
    adaptor.start(30, 30, 30);
  }
  
  function edgesToString(edge) {
    console.log(edge);
    return `${_nodes[edge.source].id} -> ${_nodes[edge.target].id}`;
  }
  
  function isSource(node) {
    return node.kind === "source";
  }
  
  function isAttribute(node) {
    return node.kind !== "source";
  }
  
  export function addSource() { 
    let data = datawang.genData(1, datawang.chooseInt(0, 5), 0);
    let joinCount = Math.floor(datawang.srand() * datawang.srand() * (data.nodes.length - 1));
    console.log(`[addSource] nodes: ${_nodes.length} + ${data.nodes.length} | edges: ${_edges.length} + ${data.nodes.length} | joins: ${joinCount}`);
    _nodes.push.apply(_nodes, data.nodes);
    _edges.push.apply(_edges, data.edges);
    var joins = datawang.genEdges(joinCount, _nodes.filter(isSource), data.nodes.filter(isAttribute), _edges);
    if(joins.length) { console.log("* joins: ", joins.map(edgesToString)); }
    _edges.push.apply(_edges, joins);
    
    _adaptor.nodes(_nodes);
    _adaptor.links(_edges);
    start = Date.now();
    _adaptor.start();
  }
  
  export function addJoin() {
    console.log(`[addJoin] nodes: ${_nodes.length} + 0 | edges: ${_edges.length} + 1 | joins: 1`);
    var joins = datawang.genEdges(1, _nodes.filter(isSource), _nodes.filter(isAttribute), _edges);
    if(joins.length) { console.log("* joins: ", joins.map(edgesToString)); }
    _edges.push.apply(_edges, joins);
    _adaptor.links(_edges);
    start = Date.now();
    _adaptor.start();
  }
}