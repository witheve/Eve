module QueryEditor {
  export interface Node {
    id: string
    fixed?: boolean
    x?: number
    y?: number
    width?: number
    height?: number
    kind?: any
  }

  export interface Edge {
    source: string,
    target: string
  }

  interface IdToNodesMap {[id:string]: Node[]};
  interface IdToIdsMap {[id:string]: string[]};
  interface Bounds {left:number, right:number, top:number, bottom:number}
  interface NodeBounds extends Bounds { id: string }
  type NodePositions = {[id:string]: [number, number]};


  export interface Layout {
    bounds: Bounds
    subBounds: Bounds[]
    nodes: NodePositions
    misfits?: number
  }

  let seed = 1;
  export function srand() {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  export class Graph {
    constructor(public size:[number, number], public sources:Node[] = [], public attributes:Node[] = [], public edges:Edge[] = []) {}
    
    /**
     * Attempt to stochastically place nodes to minimize edge intersections, avoid node overlaps, and minimize node spread.
     * @param {number} [maxSamples] The total number of unique layouts to test.
     * @param {number} [ratio] The number of edge layouts to try per structural layout. Structural layouts place all nodes but joins.
     */
    layout(maxSamples:number = 5000, ratio:number = 2) {
      // Build source -> target and target -> source lookups.
      let sourceToTarget:IdToIdsMap = {};
      let targetToSources:IdToIdsMap = {};
      for(let edge of this.edges) {
        if(!sourceToTarget[edge.source]) { sourceToTarget[edge.source] = []; }
        sourceToTarget[edge.source].push(edge.target);
        if(!targetToSources[edge.target]) { targetToSources[edge.target] = []; }
        targetToSources[edge.target].push(edge.source);
      }
      
      // Prune fixed sources and calculate the connectedness of active ones.
      let connectedness:{[id:string]: number} = {};
      let activeSources:Node[] = [];
      let fixedSources:Node[] = [];
      for(let node of this.sources) {
        if(!node.fixed) {
          activeSources.push(node);
          connectedness[node.id] = (sourceToTarget[node.id] ? sourceToTarget[node.id].length : 0);
        } else {
          fixedSources.push(node);
        }
      }
      
      // Sort sources by their connectedness to give them a better share of space.
      activeSources.sort(function(a, b) {
       if(connectedness[a.id] > connectedness[b.id]) { return 1; }
       if(connectedness[a.id] < connectedness[b.id]) { return -1; }
       return 0;
      });
      
      // Prune fixed attributes and segregate single-sourced (unjoined) attributes into sourceGroups.
      // Note: Only joined attributes will remain in the activeAttributes array.
      let activeAttributes:Node[] = [];
      let fixedAttributes:Node[] = [];
      let sourceGroups:IdToNodesMap = {};
      for(let node of this.attributes) {
        if(!node.fixed) {
          let sources = targetToSources[node.id];
          if(sources && sources.length === 1) {
            let source = sources[0];
            if(!sourceGroups[source]) { sourceGroups[source] = []; }
            sourceGroups[source].push(node);
          } else {
            activeAttributes.push(node);
          }
        } else {
          fixedAttributes.push(node);
        }
      }
      
      // Try `maxSamples` different stochastic layouts, keeping the best as determined by the goal criteria. 
      let width = this.size[0];
      let height = this.size[1];
      let hw = width / 2;
      let hh = height ; 2;
      let fixedNodes = fixedSources.concat(fixedAttributes);
      
      let minError = Infinity;
      let misfits = 0;
      let bestLayout:Layout;
      let bestSample:number = 0;

      for(let sample = 0; sample < maxSamples; sample++) {
        let currentLayout:Layout = {nodes: {}, bounds: {left: hw, top: hh, right: hw, bottom: hh}, subBounds: []};
        for(let node of fixedNodes) {
          currentLayout[node.id] = [node.x, node.y];
          let hw = node.width / 2;
          let hh = node.height / 2;
          let nodeBounds:NodeBounds = {id: node.id, left: node.x - hw, top: node.y - hh, right: node.x + hw, bottom: node.y + hh};
          if(nodeBounds.left < currentLayout.bounds.left) { currentLayout.bounds.left = nodeBounds.left; }
          if(nodeBounds.top < currentLayout.bounds.top) { currentLayout.bounds.top = nodeBounds.top; }
          if(nodeBounds.right > currentLayout.bounds.right) { currentLayout.bounds.right = nodeBounds.right; }
          if(nodeBounds.bottom > currentLayout.bounds.bottom) { currentLayout.bounds.bottom = nodeBounds.bottom; }
          currentLayout.subBounds.push(nodeBounds);
        }
        
        // Ease bounds restrictions as samples fail.
        if(bestLayout) {
          currentLayout.bounds.left = bestLayout.bounds.left - width * misfits * (sample - bestSample) / 40;
          currentLayout.bounds.top = bestLayout.bounds.top - height * misfits * (sample - bestSample) / 40;
          currentLayout.bounds.right = bestLayout.bounds.right + width * misfits * (sample - bestSample) / 40;
          currentLayout.bounds.bottom = bestLayout.bounds.bottom + height * misfits * (sample - bestSample) / 40;
        }
        
        this.fillLayout(currentLayout, activeSources, activeAttributes, sourceGroups);
        //console.group(`Sample: ${sample}`);
        //console.log("[bounds]", JSON.stringify(currentLayout.bounds));
        let err = this.measureError(currentLayout, bestLayout);
        //console.groupEnd();
        if(err < minError) {
          minError = err;
          bestLayout = currentLayout;
          misfits = bestLayout.misfits;
          bestSample = sample;
        }
      }
      console.log("best sample", bestSample, "misfits", misfits);
      return bestLayout;
    }
    
    protected fillLayout(layout:Layout, sources:Node[], attributes:Node[], sourceGroups:IdToNodesMap) {
      layout.misfits = layout.misfits || 0;
      
      for(let source of sources) {
        let positions:NodePositions = {};
        positions[source.id] = [0, 0];
        let hw = source.width / 2;
        let hh = source.height / 2;
        let bounds = {left: -hw, right: hw, top: -hh, bottom: hh};
        let group = sourceGroups[source.id];

        // If this source is associated with a group, build a layout for the group and attempt to insert the entire group at once.
        if(group) {
          let startAngle = srand() * Math.PI;
          let offsetAngle = 2 * Math.PI / group.length;
          
          // The algorithm for calculating group diameter is optimized for awesome.
          let diameter = source.width + 40;
          
          // Calculate relative coords of attributes around their source and the group's bounding box..
          for(let ix = 0; ix < group.length; ix++) {
            let attr = group[ix];
            let x = diameter * Math.cos(startAngle + offsetAngle * ix);
            let y = diameter * Math.sin(startAngle + offsetAngle * ix);

            let hw = attr.width / 2;
            let hh = attr.height / 2;
            if(x - hw < bounds.left) { bounds.left = x - hw; }
            if(y - hh < bounds.top) { bounds.top = y - hh; }
            if(x + hw > bounds.right) { bounds.right = x + hw; }
            if(y + hh > bounds.bottom) { bounds.bottom = y + hh; }
            positions[attr.id] = [x, y];
          }
        }
        
        this.placeInLayout(bounds, positions, layout);
      }
      
      for(let attr of attributes) {
        let hw = attr.width / 2;
        let hh = attr.height /2;
        let bounds:NodeBounds = {id: attr.id, left: -hw, top: -hh, right: hw, bottom: hh};
        let positions:NodePositions = {};
        positions[attr.id] = [0, 0];
        this.placeInLayout(bounds, positions, layout);
      }
    }
    
    protected placeInLayout(bounds:Bounds, nodes:NodePositions, layout:Layout, tries:number = 500) {
      let x0 = layout.bounds.left;
      let y0 = layout.bounds.top;
      let width = layout.bounds.right - x0 - (bounds.right - bounds.left);
      let height = layout.bounds.bottom - y0 - (bounds.bottom - bounds.top);
      if(width < 0 || height < 0) {
        tries = 0;
      }
      let x = x0, y = y0, fits = false;
      while(tries--) {
        x = x0 - bounds.left + srand() * width;
        y = y0 - bounds.top + srand() * height;
        
        let left = x + bounds.left;
        let top = y + bounds.top;
        let right = x + bounds.right;
        let bottom = y + bounds.bottom;
        
        fits = true;
        // Test for intersection with existing bounds.
        for(let bb of layout.subBounds) {
          if(left > bb.right) { continue; }
          if(top > bb.bottom) { continue; }
          if(right < bb.left) { continue; }
          if(bottom < bb.top) { continue; }
          fits = false;
          break;
        }
      }
        
      if(!fits) { layout.misfits++; }
      
      // Make bounds absolute.
      bounds.left += x;
      bounds.right += x;
      bounds.top += y;
      bounds.bottom += y;
      layout.subBounds.push(bounds);
      
      // Update layout bounds if necessary.
      if(bounds.left < layout.bounds.left) { layout.bounds.left = bounds.left; }
      if(bounds.top < layout.bounds.top) { layout.bounds.top = bounds.top; }
      if(bounds.right < layout.bounds.right) { layout.bounds.right = bounds.right; }
      if(bounds.bottom < layout.bounds.bottom) { layout.bounds.bottom = bounds.bottom; }
      
      // Add node absolute node positions.
      for(let nodeId in nodes) {
        nodes[nodeId][0] += x;
        nodes[nodeId][1] += y;
        layout.nodes[nodeId] = nodes[nodeId];
      }  
        
      return [x, y, fits];
    }
    
    protected measureError(layout:Layout, best?:Layout) {
      let error = 0;
      // Prefer layouts without overlaps.
      error += layout.misfits * 100;
      //console.log("[misfit]", layout.misfits * 100);
      
      // Prefer shorter edges.
      let edgeLengths = 0;
      for(let edge of this.edges) {
        let src = layout.nodes[edge.source];
        let dest = layout.nodes[edge.target];
        edgeLengths += Math.sqrt(Math.pow(dest[0] - src[0], 2) + Math.pow(dest[1] - src[1], 2));
      }
      edgeLengths /= this.edges.length;
      error += edgeLengths / Math.sqrt(this.size[0] + this.size[1]) * 20;
      //console.log("[edge length]", edgeLengths / Math.sqrt(this.size[0] + this.size[1]) * 20);
      
      // if(best) {
      //   // Prefer more compact layouts.
      //   let sizeDelta = (best.bounds.left - layout.bounds.left) +
      //                   (layout.bounds.right - best.bounds.right) +
      //                   (best.bounds.top - layout.bounds.top) +
      //                   (layout.bounds.bottom - best.bounds.bottom);
      //                   
      //   error += sizeDelta / 5;
      //   //console.log("[size delta]", sizeDelta / 5);
      // }
      error += ((layout.bounds.right - layout.bounds.left) + (layout.bounds.bottom - layout.bounds.top) / 10);
      
      return error;
    }
  }
}

module datawang {
  let seed = 1;
  let nid = 0;
  
  export interface Node extends QueryEditor.Node {
    index: number
  }
  export type Edge = QueryEditor.Edge;
  
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
      if(src.id === dest.id || (usedEdges[src.id] && usedEdges[src.id].indexOf(dest.id) !== -1)) {
        if(tries > 100) { throw new Error(`Cannot join ${ix} of ${num} edges from ${sources.length} to ${targets.length} stochastically, bailing.`); }
        ix--;
        tries++;
        continue;
      }
      tries = 0;
      if(!usedEdges[src.id]) { usedEdges[src.id] = []; }
      usedEdges[src.id].push(dest);
      edges.push({source: src.id, target: dest.id});
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
      edges.push({source: src.id, target: dest.id});
    }
    let joins = genEdges(joinCount, sources, attrs, edges);
    
    return {sources: sources, attrs: attrs, edges: edges.concat(joins)};
  }
}

module test {

  
  let start, end;
  let _adaptor;
  let _nodes;
  let _edges;
  
  function renderToCanvas(layout:QueryEditor.Layout, nodes:{[id:string]: datawang.Node}, edges:datawang.Edge[]) {
    console.log("[render]", Date.now() - start, "ms");
    let nodeCount = Object.keys(nodes).length;
    var xOffset = layout.bounds.left;
    var yOffset = layout.bounds.top;
    let positions = {};
    for(let nodeId in layout.nodes) {
      let [x, y] = layout.nodes[nodeId];
      positions[nodeId] = [x - xOffset, y - yOffset];
    }
    
    let cvs = <HTMLCanvasElement>document.getElementById("canvas");
    let ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    console.log(nodes);    
    for(let nodeId in nodes) {
      let node = nodes[nodeId];
      let [x, y] = positions[node.id];
      if(node.kind === "source") {
        console.log("source");
        ctx.fillStyle = `hsla(${Math.floor(360 * node.index / nodeCount)}, 100%, 50%, 0.6)`;
      } else {
        console.log("attr");
        ctx.fillStyle = `hsla(${Math.floor(360 * node.index / nodeCount)}, 50%, 30%, 0.5)`;
      }
      ctx.fillRect(x - node.width / 2, y - node.height / 2, node.width, node.height);
      if(node.kind === "source") {
        ctx.strokeStyle = "#0099CC";
        ctx.strokeRect(x - node.width / 2 - 2, y - node.height / 2 - 2, node.width + 4, node.height + 4);
      }
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillText(node.id, x - node.width / 2 + 4, y - node.height / 2 + 12);
    }
    
    ctx.strokeStyle = "#FFF";
    for(let edge of edges) {
      ctx.beginPath();
      let source = positions[edge.source];
      let target = positions[edge.target];
      ctx.moveTo(source[0], source[1]);
      ctx.lineTo(target[0], target[1]);
      ctx.stroke();
      ctx.closePath();
    }
  }
  
  
  export function go() {
    datawang.reset();
    let testData = datawang.genData(4, 12, 3);
    console.log("data", testData);

    let graph = new QueryEditor.Graph([960, 958], testData.sources, testData.attrs, testData.edges);
    window['graph'] = graph;
    
    let nodes:any = {};
    for(let node of testData.sources.concat(testData.attrs)) {
      nodes[node.id] = node;
    }
    
    start = Date.now();
    let layout = graph.layout();
    end = Date.now();
    console.log(`Time: ${end - start}ms`);
    console.log("layout", layout);
    renderToCanvas(layout, nodes, testData.edges);
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
  
  // export function addSource() {
  //   for(let node of _nodes) {
  //     node.fixed = true;
  //   }
  //   
  //   let data = datawang.genData(1, datawang.chooseInt(0, 5), 0);
  //   let joinCount = Math.floor(datawang.srand() * datawang.srand() * (data.nodes.length - 1));
  //   console.log(`[addSource] nodes: ${_nodes.length} + ${data.nodes.length} | edges: ${_edges.length} + ${data.nodes.length} | joins: ${joinCount}`);
  //   _nodes.push.apply(_nodes, data.nodes);
  //   _edges.push.apply(_edges, data.edges);
  //   var joins = datawang.genEdges(joinCount, _nodes.filter(isSource), data.nodes.filter(isAttribute), _edges);
  //   if(joins.length) { console.log("* joins: ", joins.map(edgesToString)); }
  //   _edges.push.apply(_edges, joins);
  //   
  //   _adaptor.nodes(_nodes);
  //   _adaptor.links(_edges);
  //   start = Date.now();
  //   _adaptor.start(10, 10, 10);
  // }
  // 
  // export function addJoin() {
  //   console.log(`[addJoin] nodes: ${_nodes.length} + 0 | edges: ${_edges.length} + 1 | joins: 1`);
  //   var joins = datawang.genEdges(1, _nodes.filter(isSource), _nodes.filter(isAttribute), _edges);
  //   if(joins.length) { console.log("* joins: ", joins.map(edgesToString)); }
  //   var join = joins[0];
  //   for(var node of _nodes) {
  //     if(node.index !== join.source && node.index !== join.target) {
  //       node.fixed = true;
  //     } else {
  //       node.fixed = false;
  //     }
  //   }
  //   _edges.push.apply(_edges, joins);
  //   _adaptor.links(_edges);
  //   start = Date.now();
  //   _adaptor.start(10, 10, 10);
  // }
}