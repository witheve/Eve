module graphLayout {
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
  interface Bounds {left:number, right:number, top:number, bottom:number, subBounds?:Bounds}
  interface NodeBounds extends Bounds { id: string }
  type NodePositions = {[id:string]: [number, number]};


  export interface Layout {
    bounds: Bounds
    subBounds: Bounds[]
    positions: NodePositions
    sizes?: NodePositions
    misfits?: number
    error?: any
  }

  let seed = 1;
  let m = Math.pow(2, 32);
  let c = 1013904223;
  let a = 1664525;
  export function srand() {
    return (seed = (a * seed + c) % m) / m;
  }
  
  function clone<T>(obj:T):T {
    let res = {};
    for(let k in obj) {
      if(obj[k].constructor === Array) {
        res[k] = obj[k].slice();
      } else if(typeof obj[k] === "object") {
        res[k] = clone(obj[k]);
      } else {
        res[k] = obj[k];
      }
    }
    return <T>res;
  }
  
  function pointsToBB(...points:[number, number][]) {
    let bb = {top: Infinity, left: Infinity, bottom: 0, right: 0};
    for(let point of points) {
      if(point[1] > bb.bottom) {
        bb.bottom = point[1];
      } else if(point[1] < bb.top) {
        bb.top = point[1];
      }
      if(point[0] > bb.right) {
        bb.right = point[0];
      } else if(point[0] < bb.left) {
        bb.left = point[0];
      }
    }
    return bb;
  }
  
  function unionBB(a:Bounds, b:Bounds) {
    return {
      top: (a.top < b.top) ? a.top : b.top,
      left: (a.left < b.left) ? a.left : b.left,
      bottom: (a.bottom > b.bottom) ? a.bottom : b.bottom,
      right: (a.right > b.right) ? a.right : b.right,
    }
  }
  
  function intersectsBB(a:Bounds, b:Bounds) {
    if(a.left > b.right) { return false; }
    if(a.top > b.bottom) { return false; }
    if(a.right < b.left) { return false; }
    if(a.bottom < b.top) { return false; }
    return true;
  }
  
  function mergeIntoBB(dest:Bounds, src:Bounds) {
    dest.top = (dest.top < src.top) ? dest.top : src.top;
    dest.left = (dest.left < src.left) ? dest.left : src.left;
    dest.bottom = (dest.bottom > src.bottom) ? dest.bottom : src.bottom;
    dest.right = (dest.right > src.right) ? dest.right : src.right;
    return dest;
  }

  function determinant(x1, y1, x2, y2) {
    return x1 * y2 - x2 * y1;
  }
  
  function intersects(a1, a2, b1, b2) {
    let bba = pointsToBB(a1, a2);
    let bbb = pointsToBB(b1, b2);
    if(!intersectsBB(bba, bbb)) { return undefined; }
    
    let m1 = determinant(a1[0], a1[1], a2[0], a2[1]);
    let m2 = determinant(a1[0], 1, a2[0], 1);
    let m3 = determinant(b1[0], b1[1], b2[0], b2[1]);
    let m4 = determinant(b1[0], 1, b2[0], 1);
    
    let xu = determinant(m1, m2, m3, m4);
    
    let m5 = determinant(a1[0], 1, a2[0], 1);
    let m6 = determinant(a1[1], 1, a2[1], 1);
    let m7 = determinant(b1[0], 1, b2[0], 1);
    let m8 = determinant(b1[1], 1, b2[1], 1);
    
    let denom = determinant(m5, m6, m7, m8);
    
    let x = xu/denom;
    
    let m9 = determinant(a1[1], 1, a2[1], 1);
    let m10 = determinant(b1[1], 1, b2[1], 1);
    
    let yu = determinant(m1, m9, m3, m10);
    let y = yu / denom;
    
    if(x <= bba.left || x >= bba.right || y <= bba.top || y >= bba.bottom) { return undefined; }
    if(x <= bbb.left || x >= bbb.right || y <= bbb.top || y >= bbb.bottom) { return undefined; }
    if(!isNaN(y)){
      return y;
    }
    
    return undefined;
  }


  export class Graph {
    protected sourceToTarget:IdToIdsMap
    protected targetToSources:IdToIdsMap
    
    constructor(public size:[number, number], public sources:Node[] = [], public attributes:Node[] = [], public edges:Edge[] = []) {
    }
    
    /**
     * Attempt to stochastically place nodes to minimize edge intersections, avoid node overlaps, and minimize node spread.
     * @param {number} [maxSamples] The total number of unique layouts to test.
     * @param {number} [ratio] The number of edge layouts to try per structural layout. Structural layouts place all nodes but joins.
     */
    layout(maxSamples:number = 750) {
      // Build source -> target and target -> source lookups.
      let sourcesById = {};
      let attributesById = {};
      for(let node of this.sources) {
        sourcesById[node.id] = node;
      }
      for(let node of this.attributes) {
        attributesById[node.id] = node;
      }
      
      
      let sourceToTarget:IdToIdsMap = {};
      let targetToSources:IdToIdsMap = {};
      for(let edge of this.edges) {
        if(!sourcesById[edge.source]) { throw new Error("No matching source for edge:" + JSON.stringify(edge)); }
        if(!attributesById[edge.target]) { throw new Error("No matching target for edge:" + JSON.stringify(edge)); }
        
        if(!sourceToTarget[edge.source]) { sourceToTarget[edge.source] = []; }
        sourceToTarget[edge.source].push(edge.target);
        if(!targetToSources[edge.target]) { targetToSources[edge.target] = []; }
        targetToSources[edge.target].push(edge.source);
      }
      this.sourceToTarget = sourceToTarget;
      this.targetToSources = targetToSources;
      
      // Prune fixed sources and calculate the connectedness of active ones.
      let connectedness:{[id:string]: number} = {};
      let activeSources:Node[] = [];
      let fixedSources:Node[] = [];
      for(let node of this.sources) {
        if(node.x === undefined || node.y === undefined) {
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
        if(node.x === undefined || node.y === undefined) {
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
      let fixedNodes = fixedSources.concat(fixedAttributes);

      // Pre-compute layout for all fixed nodes.
      let fixedLayout:Layout = {bounds: {top: 0, left: 0, bottom: 0, right: 0}, positions:{}, subBounds: []};
      for(let node of fixedNodes) {
        let hw = node.width / 2;
        let hh = node.height / 2;
        let nodeBounds:NodeBounds = {id: node.id, left: node.x - hw, top: node.y - hh, right: node.x + hw, bottom: node.y + hh};
        fixedLayout.bounds = mergeIntoBB(fixedLayout.bounds, nodeBounds);
        fixedLayout.subBounds.push(nodeBounds);
        fixedLayout.positions[node.id] = [node.x, node.y];
      }
      
      let minError = Infinity;
      let bestLayout:Layout = fixedLayout;
      let bestSample:number = 0;
      
      let sourceLayouts = {};
      let neueWidth = 0;
      let neueHeight = 0;
      for(let source of activeSources) {
        sourceLayouts[source.id] = this.layoutSourceGroup(source, sourceGroups[source.id]);
        let bb:Bounds = sourceLayouts[source.id].bounds;
        neueWidth += (bb.right - bb.left);
        neueHeight += (bb.bottom - bb.top);
      }
      for(let node of activeAttributes) {
        neueWidth += node.width;
        neueHeight += node.height;
      }
      
      // Calculate a window that should be able to contain the new content.
      let width, height;
      let totalUsedWidth = fixedLayout.bounds.right - fixedLayout.bounds.left;
      let totalUsedHeight = fixedLayout.bounds.bottom - fixedLayout.bounds.top;
      if(totalUsedWidth < totalUsedHeight) {
        width = totalUsedWidth + neueWidth + 20;
        height = Math.max(totalUsedHeight, neueHeight) + 20;  
      } else {
        width = Math.max(totalUsedWidth, neueWidth) + 20;
        height = totalUsedHeight + neueHeight + 20;
      }
      
      for(let sample = 0; sample < maxSamples; sample++) {
        let currentLayout:Layout = {positions: clone(fixedLayout.positions), bounds: {left: 0, top: 0, right: width, bottom: height}, subBounds: fixedLayout.subBounds.slice(), misfits: 0};

        for(let source of activeSources) {
          this.placeInLayout(clone(sourceLayouts[source.id].bounds), clone(sourceLayouts[source.id].positions), currentLayout, 100);
        }
        
        for(let attr of activeAttributes) {
          let hw = attr.width / 2;
          let hh = attr.height / 2;
          let bounds:NodeBounds = {id: attr.id, left: -hw, top: -hh, right: hw, bottom: hh};
          let positions:NodePositions = {};
          positions[attr.id] = [0, 0];
          this.placeInLayout(bounds, positions, currentLayout, 50);
        }
      
        let err = this.measureError(currentLayout, minError);
        if(err < minError) {
          minError = err;
          bestLayout = currentLayout;
          bestSample = sample;
        }
      }
      
      bestLayout.sizes = {};
      for(let node of this.sources.concat(this.attributes)) {
        bestLayout.sizes[node.id] = [node.width, node.height];
      }
      
        // console.log(`
        //   sample: ${bestSample}
        //   misfits: ${bestLayout.misfits}
        //   error: ${minError}
        //   width: ${width}
        //   height: ${height}
        // `);
      
      return bestLayout;
    }
    
    protected layoutSourceGroup(source:Node, group:Node[]):{positions:NodePositions, bounds:Bounds} {
      let hw = source.width / 2;
      let hh = source.height / 2;
      let bounds = {left: -hw, right: hw, top: -hh, bottom: hh};
      
      let positions:NodePositions = {};
      positions[source.id] = [0, 0];

      if(!group || !group.length) { return {positions:positions, bounds: bounds}; }
      
      let maxTargetWidth = 0;            
      for(let target of group) {
        if(target.width > maxTargetWidth) {
          maxTargetWidth = target.width;
        }
      }
      
      // If this source is associated with a group, build a layout for the group and attempt to insert the entire group at once.
      let startAngle = srand() * Math.PI;
      let offsetAngle = 2 * Math.PI / group.length;
      
      // The algorithm for calculating group diameter is optimized for awesome.
      let diameter = (source.width + maxTargetWidth) / 2 + 10;
      
      // Calculate relative coords of attributes around their source and the group's bounding box..
      for(let ix = 0; ix < group.length; ix++) {
        let attr = group[ix];
        let hw = attr.width / 2;
        let hh = attr.height / 2;

        let x = diameter * Math.cos(startAngle + offsetAngle * ix);
        let y = diameter * Math.sin(startAngle + offsetAngle * ix);
        positions[attr.id] = [x, y];
        
        if(x - hw < bounds.left) { bounds.left = x - hw; }
        if(y - hh < bounds.top) { bounds.top = y - hh; }
        if(x + hw > bounds.right) { bounds.right = x + hw; }
        if(y + hh > bounds.bottom) { bounds.bottom = y + hh; }
      }
      
      return {positions:positions, bounds: bounds};
    }
    
    protected placeInLayout(bounds:Bounds, nodes:NodePositions, layout:Layout, tries:number = 1000) {
      let nodeCount = Object.keys(nodes).length;
      let x0 = layout.bounds.left - bounds.left;
      let y0 = layout.bounds.top - bounds.top;
      let width = layout.bounds.right - layout.bounds.left - (bounds.right - bounds.left);
      let height = layout.bounds.bottom - layout.bounds.top - (bounds.bottom - bounds.top);
      if(width <= 0) {
        width = 0;
        tries /= 10;
      }
      if(height <= 0) {
        height = 0;
        tries /= 10
      }
      let x = x0, y = y0, fits = false;
      while(tries-- > 0) {
        x = x0 + srand() * width;
        y = y0 + srand() * height;
        
        let left = x + bounds.left;
        let top = y + bounds.top;
        let right = x + bounds.right;
        let bottom = y + bounds.bottom;
        
        fits = true;
        // Test for intersection with existing bounds.
        for(let bb of layout.subBounds || []) {
          if(left > bb.right) { continue; }
          if(top > bb.bottom) { continue; }
          if(right < bb.left) { continue; }
          if(bottom < bb.top) { continue; }
          fits = false;
          break;
        }
        if(fits === true) {
          break;
        }
      }
      if(!fits) { layout.misfits += nodeCount; }
      
      // Suck placement as close to the center as possible without colliding.
      if(layout.subBounds.length < 400) { 
        let layoutWidth = layout.bounds.right - layout.bounds.left;
        let layoutHeight = layout.bounds.bottom - layout.bounds.top;
        let deltaX = layout.bounds.left + layoutWidth / 2 - x;
        let deltaY = layout.bounds.top + layoutHeight / 2 - y;
        let lastX = x;
        let lastY = y;
        for(var i = 5; i > 1; i--) {
          let curX = x + deltaX / i;
          let curY = y + deltaY / i;
   
          let left = curX + bounds.left;
          let top = curY + bounds.top;
          let right = curX + bounds.right;
          let bottom = curY + bounds.bottom;
          
          fits = true;
          // Test for intersection with existing bounds.
          for(let bb of layout.subBounds || []) {
            if(left > bb.right) { continue; }
            if(top > bb.bottom) { continue; }
            if(right < bb.left) { continue; }
            if(bottom < bb.top) { continue; }
            fits = false;
            break;
          }
          if(fits) {
            lastX = curX;
            lastY = curY;
          } else {
            break;
          }
        }
        x = lastX;
        y = lastY;
      }
      
      // Add node absolute node positions.
      for(let nodeId in nodes) {
        nodes[nodeId][0] += x;
        nodes[nodeId][1] += y;
        layout.positions[nodeId] = nodes[nodeId];
      }
      
      // Make bounds absolute.
      bounds.left += x;
      bounds.right += x;
      bounds.top += y;
      bounds.bottom += y;
      layout.subBounds.push(bounds);
      
      // Update layout bounds if necessary.
      mergeIntoBB(layout.bounds, bounds);
      
      return tries;
    }
    
    protected measureError(layout:Layout, threshold:number = Infinity) {
     
      let error = 0;
      let layoutWidth = (layout.bounds.right - layout.bounds.left);
      let layoutHeight = (layout.bounds.bottom - layout.bounds.top);
      
      // Fast tests
      
      // Prefer more compact layouts.
      let graphSize =  Math.sqrt((layout.bounds.right - layout.bounds.left) + (layout.bounds.bottom - layout.bounds.top));
      error += graphSize;
      
      // Prefer layouts without overlaps.
      let misfitScore = layout.misfits * 150;
      error += misfitScore;

      // Prefer shorter edges and edges of equal length.
      let edgeLengths = 0;
      let minEdge = Infinity;
      let maxEdge = 0;
      for(let edge of this.edges) {
        let src = layout.positions[edge.source];
        let dest = layout.positions[edge.target];
        if(!src || !dest) { console.error("Faulty edge", edge, "sources", this.sources.map((node) => node.id), "attrs", this.attributes.map((node) => node.id), "layout nodes", layout.positions); }
        let length = Math.sqrt(Math.pow(dest[0] - src[0], 2) + Math.pow(dest[1] - src[1], 2));
        edgeLengths += length;
        if(length < minEdge) { minEdge = length; }
        if(length > maxEdge) { maxEdge = length; }
      }
      edgeLengths /= this.edges.length;
      let edgeLengthScore = edgeLengths / graphSize * 15;
      error += edgeLengthScore;

      if(minEdge !== Infinity) {
        let edgeDisparityScore = (maxEdge - minEdge) / edgeLengths * 40;
        error += edgeDisparityScore;
      }

      // Before executing slow tests, check if this layout is already too unfit for them to matter.      
      // if(error > threshold) { return error; }

      // Prefer layouts without edge intersections.
      let intersections = 0;
      let edgeCount = this.edges.length;
      // for(let ix = 0; ix < edgeCount; ix++) {
      //   let edge = this.edges[ix];
      //   let a1 = layout.positions[edge.source];
      //   let a2 = layout.positions[edge.target];
      //   let abb = pointsToBB(a1, a2);
      //   
      //   for(let otherIx = ix; otherIx < edgeCount; otherIx++) {
      //     let other = this.edges[otherIx];
      //     if(edge.source === other.source || edge.target === other.target) { continue; }
      //     let b1 = layout.positions[other.source];
      //     let b2 = layout.positions[other.target];
      //     let bbb = pointsToBB(b1, b2);
      //     if(intersectsBB(abb, bbb)) {
      //       intersections++;
      //       error += 100;
      //       if(error > threshold) { return error; }
      //     }
      //   }
      // }
      //let intersectionScore = intersections * 100;
      //error += intersectionScore;
      
      return error;
    }
  }
}

// module datawang {
//   let seed = 1;
//   let nid = 0;
//   
//   export interface Node extends graphLayout.Node {
//     index: number
//   }
//   export type Edge = graphLayout.Edge;
//   
//   export function reset() {
//     nid = 0;
//   }
//   
//   // courtesy of <http://stackoverflow.com/a/19303725>
//   export function srand() {
//       let x = Math.sin(seed++) * 10000;
//       return x - Math.floor(x);
//   }
//   
//   export function chooseInt(min:number, max:number):number {
//     return min + Math.floor(srand() * (max - min));
//   }
//   
//   export function choose<T>(choices:T[]): T {
//     return choices[chooseInt(0, choices.length)];
//   }
//   
//   export function genNodes(num:number, offset:number = 0):Node[] {
//     let nodes:Node[] = [];
//     for(let ix = nid; ix < num + nid; ix++) {
//       nodes.push({
//         id: "node-" + (ix + offset),
//         index: ix + offset,
//         width: Math.floor(srand() * 7) * 10 + 60,
//         height: 40
//       });
//     }
//     nid += num;
//     return nodes;
//   }
//   export function genEdges(num:number, sources:Node[], targets:Node[], existing:Edge[] = []):Edge[] {
//     if(sources.length * targets.length < num) {
//       return [];
//     }
//     let edges:Edge[] = [];
//     let usedEdges = {};
//     for(let edge of existing) {
//       if(!usedEdges[edge.source]) { usedEdges[edge.source] = []; }
//        usedEdges[edge.source].push(edge.target);
//     }
//     let tries = 0;
//     for(let ix = 0; ix < num; ix++) {
//       let src = choose(sources);
//       let dest = choose(targets);
//       if(src.id === dest.id || (usedEdges[src.id] && usedEdges[src.id].indexOf(dest.id) !== -1)) {
//         if(tries > 100) { throw new Error(`Cannot join ${ix} of ${num} edges from ${sources.length} to ${targets.length} stochastically, bailing.`); }
//         ix--;
//         tries++;
//         continue;
//       }
//       tries = 0;
//       if(!usedEdges[src.id]) { usedEdges[src.id] = []; }
//       usedEdges[src.id].push(dest);
//       edges.push({source: src.id, target: dest.id});
//     }
//     return edges;
//   }
//   
//   export function genData(sourceCount:number, attrCount:number, joinCount:number) {
//     let sources = genNodes(sourceCount).map(function(node) {
//       node.kind = "source";
//       return node;
//     });
//     let attrs = genNodes(attrCount);
//     let edges:Edge[] = [];
//     
//     for(let dest of attrs) {
//       let src = choose(sources);
//       edges.push({source: src.id, target: dest.id});
//     }
//     let joins = genEdges(joinCount, sources, attrs, edges);
//     
//     return {sources: sources, attrs: attrs, edges: edges.concat(joins)};
//   }
// }
// 
// module test {
//   let start, end;
//   let _adaptor;
//   let _nodes;
//   let _edges;
//   
//   window["showBounds"] = true;
//   
//   function renderToCanvas(layout:graphLayout.Layout, nodes:{[id:string]: datawang.Node}, edges:datawang.Edge[]) {
//     console.log("[render]", Date.now() - start, "ms");
//     
//     let cvs = <HTMLCanvasElement>document.getElementById("canvas");
//     let ctx = cvs.getContext('2d');
//     ctx.clearRect(0, 0, cvs.width, cvs.height);
//     
//     if(window["showBounds"]) {
//       for(let ix = 0; ix < layout.subBounds.length; ix++) {
//         let bounds = layout.subBounds[ix];
//         ctx.fillStyle = `hsla(${Math.floor(360 * ix / layout.subBounds.length)}, 50%, 30%, 0.2)`;
//         ctx.strokeStyle = `hsla(${Math.floor(360 * ix / layout.subBounds.length)}, 60%, 50%, 0.6)`;
//         ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
//         ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
//       }
//       
//       ctx.strokeStyle = "rgba(255, 192, 64, 1)";
//       ctx.strokeRect(layout.bounds.left, layout.bounds.top, layout.bounds.right - layout.bounds.left, layout.bounds.bottom - layout.bounds.top);
//     }
//     
//     let nodeCount = Object.keys(nodes).length;
//     var xOffset = layout.bounds.left;
//     var yOffset = layout.bounds.top;
//     let positions = {};
//     for(let nodeId in nodes) {
//       let pos = layout.positions[nodeId];
//       positions[nodeId] = [pos[0] - xOffset, pos[1] - yOffset];
//     }
// 
//     for(let nodeId in nodes) {
//       let node = nodes[nodeId];
//       let w = node.width - 10;
//       let h = node.height - 10;
//       let [x, y] = positions[node.id];
//       if(node.kind === "source") {
//         ctx.fillStyle = `hsla(${Math.floor(360 * node.index / nodeCount)}, 100%, 50%, 0.6)`;
//       } else {
//         ctx.fillStyle = `hsla(${Math.floor(360 * node.index / nodeCount)}, 50%, 30%, 0.5)`;
//       }
//       ctx.fillRect(x - w / 2, y - h / 2, w, h);
//       if(node.kind === "source") {
//         ctx.strokeStyle = "#0099CC";
//         ctx.strokeRect(x - w / 2 - 2, y - h / 2 -2, w + 4, h + 4);
//       }
//       ctx.fillStyle = "rgb(255, 255, 255)";
//       ctx.fillText(node.id, x - w / 2 + 4, y - h / 2 + 12);
//     }
//     
//     ctx.strokeStyle = "#FFF";
//     for(let edge of edges) {
//       ctx.beginPath();
//       let source = positions[edge.source];
//       let target = positions[edge.target];
//       ctx.moveTo(source[0], source[1]);
//       ctx.lineTo(target[0], target[1]);
//       ctx.stroke();
//       ctx.closePath();
//     }
//   }
//   
//   
//   export function go() {
//     datawang.reset();
//     let testData = datawang.genData(0, 0, 0);
//     console.log("data", testData);
// 
//     let graph = new graphLayout.Graph([960, 958], testData.sources, testData.attrs, testData.edges);
//     window['graph'] = graph;
//     
//     let nodes:any = {};
//     for(let node of testData.sources.concat(testData.attrs)) {
//       nodes[node.id] = node;
//     }
//     
//     start = Date.now();
//     let layout = graph.layout();
//     window["layout"]  = layout;
//     end = Date.now();
//     console.log(`Time: ${end - start}ms`);
//     console.log("layout", layout);
//     for(let node of graph.sources) {
//       node.x = layout.positions[node.id][0];
//       node.y = layout.positions[node.id][1];
//     }
//     for(let node of graph.attributes) {
//       node.x = layout.positions[node.id][0];
//       node.y = layout.positions[node.id][1];
//     }
//     
//     renderToCanvas(layout, nodes, testData.edges);
//   }
//   
//   function edgesToString(edge) {
//     let graph = window["graph"];
//     return `${graph.sources.filter((node) => node.id === edge.source)[0].id} -> ${graph.attributes.filter((node) => node.id === edge.target)[0].id}`;
//   }
//   
//   function isSource(node) {
//     return node.kind === "source";
//   }
//   
//   function isAttribute(node) {
//     return node.kind !== "source";
//   }
//   
//   export function addSource() {
//     let graph = window["graph"];
//     let data = datawang.genData(1, datawang.chooseInt(0, 5), 0);
//     let joinCount = Math.floor(datawang.srand() * datawang.srand() * (data.attrs.length));
//    
//     console.log(`[addSource] sources: ${graph.sources.length} + ${data.sources.length} | attrs: ${graph.attributes.length} + ${data.attrs.length} | edges: ${graph.edges.length} + ${data.edges.length} | joins: ${joinCount}`);
//     
//     var joins = datawang.genEdges(joinCount, graph.sources, data.attrs, graph.edges);
//     
//     graph.sources.push.apply(graph.sources, data.sources);
//     graph.attributes.push.apply(graph.attributes, data.attrs);
//     graph.edges.push.apply(graph.edges, data.edges.concat(joins));
//     
//     if(joins.length) { console.log("* joins: ", joins.map(edgesToString)); }
//     
//     
//      start = Date.now();
//     let layout = graph.layout();
//     window["layout"]  = layout;
//     end = Date.now();
//     console.log(`Time: ${end - start}ms`);
//     console.log("layout", layout);
//     for(let node of graph.sources) {
//       node.x = layout.positions[node.id][0];
//       node.y = layout.positions[node.id][1];
//     }
//     for(let node of graph.attributes) {
//       node.x = layout.positions[node.id][0];
//       node.y = layout.positions[node.id][1];
//     }
//     
//     let nodes:any = {};
//     for(let node of graph.sources.concat(graph.attributes)) {
//       nodes[node.id] = node;
//     }
//     
//     renderToCanvas(layout, nodes, graph.edges);
//   }
// }