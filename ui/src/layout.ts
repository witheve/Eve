module graphLayout {
  export interface Node {
    id: string
    fixed?: boolean
    x?: number
    y?: number
    width?: number
    height?: number
    [attr:string]: any
  }

  export interface Edge { source: string, target: string }

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

  /**
   * Simple LCG for fast pseudo-random generation.
   */
  let seed = 1;
  let m = Math.pow(2, 32);
  let c = 1013904223;
  let a = 1664525;
  export function srand() {
    return (seed = (a * seed + c) % m) / m;
  }

  /**
   * Clone the given object, slicing all contained arrays.
   */
  function clone<T extends Object>(obj:T):T {
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

  /**
   * Given a list of [x, y] pairs, return the bounding box which contains them.
   */
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

  /**
   * Given two bounding boxes, return their geometric union.
   */
  function unionBB(a:Bounds, b:Bounds) {
    return {
      top: (a.top < b.top) ? a.top : b.top,
      left: (a.left < b.left) ? a.left : b.left,
      bottom: (a.bottom > b.bottom) ? a.bottom : b.bottom,
      right: (a.right > b.right) ? a.right : b.right,
    }
  }

  /**
   * Given two bounding boxes, return true if they intersect.
   */
  function intersectsBB(a:Bounds, b:Bounds) {
    if(a.left > b.right) { return false; }
    if(a.top > b.bottom) { return false; }
    if(a.right < b.left) { return false; }
    if(a.bottom < b.top) { return false; }
    return true;
  }

  /**
   * Given two bounding boxes, mutate the first to geometrically contain the second.
   */
  function mergeIntoBB(dest:Bounds, src:Bounds) {
    dest.top = (dest.top < src.top) ? dest.top : src.top;
    dest.left = (dest.left < src.left) ? dest.left : src.left;
    dest.bottom = (dest.bottom > src.bottom) ? dest.bottom : src.bottom;
    dest.right = (dest.right > src.right) ? dest.right : src.right;
    return dest;
  }

  export class Graph {
    protected sourceToTarget:IdToIdsMap
    protected targetToSources:IdToIdsMap

    public sourcesById:{[id:string]: Node}
    public attributesById:{[id:string]: Node}

    constructor(public sources:Node[] = [], public attributes:Node[] = [], public edges:Edge[] = [], public minimumSize?:[number, number]) {}

    /**
     * Attempt to stochastically place nodes to minimize edge intersections, node overlaps, and node spread.
     * @param {number} [maxSamples] The total number of unique layouts to test.
     * @param {number} [maxGroupPlacements] The number of attempts to make per group to find a placement with no collisions.
     * @param {number} [maxJoinPlacements] The number of attempts to make per join node to find a placement with no collisions.
     */
    layout(maxSamples:number = 1250, maxGroupPlacements = 100, maxJoinPlacements = 50) {
      // Build id -> node lookups.
      this.sourcesById = {};
      this.attributesById = {};
      for(let node of this.sources) {
        this.sourcesById[node.id] = node;
      }
      for(let node of this.attributes) {
        this.attributesById[node.id] = node;
      }

      // Build source -> target and target -> source lookups.
      let sourceToTarget:IdToIdsMap = {};
      let targetToSources:IdToIdsMap = {};
      for(let edge of this.edges) {
        if(!this.sourcesById[edge.source]) { throw new Error("No matching source for edge:" + JSON.stringify(edge)); }
        if(!this.attributesById[edge.target]) { throw new Error("No matching target for edge:" + JSON.stringify(edge)); }

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
          node.fixed = true;
          fixedSources.push(node);
        }
      }

      // Sort sources by their connectedness to give them first pick when alloting space.
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
          if(sources && sources.length === 1 && !this.sourcesById[sources[0]].fixed) {
            let source = sources[0];
            if(!sourceGroups[source]) { sourceGroups[source] = []; }
            sourceGroups[source].push(node);
          } else {
            activeAttributes.push(node);
          }
        } else {
          node.fixed = true;
          fixedAttributes.push(node);
        }
      }

      // Pre-compute layout for all fixed nodes.
      let fixedNodes = fixedSources.concat(fixedAttributes);
      let fixedLayout:Layout = {bounds: {top: 0, left: 0, bottom: 0, right: 0}, positions:{}, subBounds: []};
      for(let node of fixedNodes) {
        let hw = node.width / 2;
        let hh = node.height / 2;
        let nodeBounds:NodeBounds = {id: node.id, left: node.x - hw, top: node.y - hh, right: node.x + hw, bottom: node.y + hh};
        fixedLayout.bounds = mergeIntoBB(fixedLayout.bounds, nodeBounds);
        fixedLayout.subBounds.push(nodeBounds);
        fixedLayout.positions[node.id] = [node.x, node.y];
      }

      // Pre-compute the layouts for source groups so we can focus on placements.
      let sourceLayouts = {};
      let neueWidth = 0;
      let neueHeight = 0;
      let maxNeueWidth = 0;
      let maxNeueHeight = 0;
      for(let source of activeSources) {
        sourceLayouts[source.id] = this.layoutSourceGroup(source, sourceGroups[source.id]);
        let bb:Bounds = sourceLayouts[source.id].bounds;
        neueWidth += (bb.right - bb.left);
        neueHeight += (bb.bottom - bb.top);
        maxNeueWidth = (maxNeueWidth > (bb.right - bb.left)) ? maxNeueWidth : (bb.right - bb.left);
        maxNeueHeight = (maxNeueHeight > (bb.bottom - bb.top)) ? maxNeueHeight : (bb.bottom - bb.top);
      }
      for(let node of activeAttributes) {
        neueWidth += node.width;
        neueHeight += node.height;
        maxNeueWidth = maxNeueWidth > node.width ? maxNeueWidth : node.width;
        maxNeueHeight = maxNeueHeight > node.height ? maxNeueHeight : node.height;
      }

      // Calculate a window that should be able to contain the new content.
      let width, height;
      let totalUsedWidth = fixedLayout.bounds.right - fixedLayout.bounds.left;
      let totalUsedHeight = fixedLayout.bounds.bottom - fixedLayout.bounds.top;
      if(totalUsedWidth < totalUsedHeight) {
        width = totalUsedWidth + neueWidth + 20;
        height = Math.max(totalUsedHeight, maxNeueHeight) + 20;
      } else {
        width = Math.max(totalUsedWidth, maxNeueWidth) + 20;
        height = totalUsedHeight + neueHeight + 20;
      }
      if(this.minimumSize) {
        width = (width > this.minimumSize[0]) ? width : this.minimumSize[0];
        height = (height > this.minimumSize[1]) ? height : this.minimumSize[1];
      }

      // Try [maxSamples] layouts, measuring the error of each and keeping the best.
      let minError = Infinity;
      let bestLayout:Layout = fixedLayout;
      let bestSample:number = 0;
      for(let sample = 0; sample < maxSamples; sample++) {
        let currentLayout:Layout = {positions: clone(fixedLayout.positions), bounds: {left: 0, top: 0, right: width, bottom: height}, subBounds: fixedLayout.subBounds.slice(), misfits: 0};
        for(let source of activeSources) {
          this.placeInLayout(clone(sourceLayouts[source.id].bounds), clone(sourceLayouts[source.id].positions), currentLayout, maxGroupPlacements);
        }

        for(let attr of activeAttributes) {
          let hw = attr.width / 2;
          let hh = attr.height / 2;
          let bounds:NodeBounds = {id: attr.id, left: -hw, top: -hh, right: hw, bottom: hh};
          let positions:NodePositions = {};
          positions[attr.id] = [0, 0];
          this.placeInLayout(bounds, positions, currentLayout, maxJoinPlacements);
        }

        let err = this.measureError(currentLayout, minError);
        if(err < minError) {
          minError = err;
          bestLayout = currentLayout;
          bestSample = sample;
        }
      }

      // Pack the node sizes into an id -> sizes lookup for ease of use for clients.
      bestLayout.sizes = {};
      for(let node of this.sources.concat(this.attributes)) {
        bestLayout.sizes[node.id] = [node.width, node.height];
      }
      return bestLayout;
    }

    protected placeInCircle(node:Node, radius:number, angle:number, positions:NodePositions, bounds:Bounds[]) {
      let hw = node.width / 2;
      let hh = node.height / 2;
      let x = radius * Math.cos(angle);
      let y = radius * Math.sin(angle);
      let myBounds = {left: x - hw, top: y - hh, right: x + hw, bottom: y + hh};
      positions[node.id] = [x, y];
      bounds.push(myBounds);
      for(let other of bounds) {
        if(other !== myBounds && intersectsBB(myBounds, other)) {
          return false;
        }
      }
      return true;
    }

    /**
     * Given a source and its dependents, lay them out into a radial group.
     */
    protected layoutSourceGroup(source:Node, group:Node[]):{positions:NodePositions, bounds:Bounds} {
      let hw = source.width / 2;
      let hh = source.height / 2;
      let bounds = {left: -hw, right: hw, top: -hh, bottom: hh};

      let positions:NodePositions = {};
      positions[source.id] = [0, 0];

      // This source has no group, so place it singly.
      if(!group || !group.length) { return {positions:positions, bounds: bounds}; }

      // Sort group by width, so we can minimize edge length by placing nodes intelligently.
      group.sort((a, b) => b.width - a.width);

      // @NOTE: The algorithm for calculating group diameter is optimized for awesome.
      let maxWidth = (group[group.length - 2] || group[group.length - 1]).width;
      let maxHeight = 0;
      let avgWidth = 0;
      for(let node of group) {
        maxHeight = (node.height > maxHeight) ? node.height : maxHeight;
        avgWidth += node.width;
      }
      avgWidth /= group.length;

      let radius = (source.width + maxWidth) / 2 + 10;
      let startAngle = Math.asin(maxHeight / radius);
      let offsetAngle = Math.PI / group.length;

      // Calculate relative coords of attributes around their source and the group's bounding box. 4 way
      let subBounds = [];
      let tries = 3;
      for(let ix = 0, length = group.length; ix < length; ix += 2) {
        let angle = startAngle + offsetAngle * ix;
        let node = group[ix];
        let failed = !this.placeInCircle(group[ix], radius, angle, positions, subBounds);
        if(group[ix + 1]) {
          failed = !this.placeInCircle(group[ix + 1], radius, angle + Math.PI, positions, subBounds) || failed;
        }

        if(failed && tries-- > 0) {
          subBounds = [];
          radius += avgWidth / 3;
          ix = -2;
          continue;
        }
      }


      for(let node of group) {
        let [x, y] = positions[node.id];
        let hw = node.width / 2;
        let hh = node.height / 2;

        if(x - hw < bounds.left) { bounds.left = x - hw; }
        if(y - hh < bounds.top) { bounds.top = y - hh; }
        if(x + hw > bounds.right) { bounds.right = x + hw; }
        if(y + hh > bounds.bottom) { bounds.bottom = y + hh; }
      }

      return {positions:positions, bounds: bounds};
    }

    /**
     * Attempt to place the given bounding box into the existing layout without collision a maximum of [tries] times.
     * Either way, insert the given nodes and bounding box into the layout when complete.
     * When a fit is not found before running out of tries, increase the layout's misfit counter.
     */
    protected placeInLayout(bounds:Bounds, nodes:NodePositions, layout:Layout, tries:number = 100) {
      let nodeCount = Object.keys(nodes).length;
      let x0 = layout.bounds.left - bounds.left;
      let y0 = layout.bounds.top - bounds.top;
      let width = layout.bounds.right - layout.bounds.left - (bounds.right - bounds.left);
      let height = layout.bounds.bottom - layout.bounds.top - (bounds.bottom - bounds.top);
      // If width or height bottom out, we only need to place along one axis, so run fewer tries.
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
      if(layout.subBounds.length < 100) {
        let layoutWidth = layout.bounds.right - layout.bounds.left;
        let layoutHeight = layout.bounds.bottom - layout.bounds.top;
        let deltaX = layout.bounds.left + layoutWidth / 2 - x;
        let deltaY = layout.bounds.top + layoutHeight / 2 - y;
        let lastX = x;
        let lastY = y;
        for(var i = 6; i > 1; i--) {
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

    /**
     * Approximate the distance between the given layout and a reasonable user-created layout.
     */
    protected measureError(layout:Layout, threshold:number = Infinity) {
      let error = 0;
      let layoutWidth = (layout.bounds.right - layout.bounds.left);
      let layoutHeight = (layout.bounds.bottom - layout.bounds.top);

      // Prefer more compact layouts.
      let graphSize =  Math.sqrt((layout.bounds.right - layout.bounds.left) + (layout.bounds.bottom - layout.bounds.top));
      error += graphSize;

      // Prefer layouts without overlaps.
      let misfitScore = layout.misfits * 150;
      error += misfitScore;

      if(this.edges.length > 0) {
        // Prefer shorter edges
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
        let edgeLengthScore = edgeLengths / graphSize * 20;
        error += edgeLengthScore;

        // Prefer edges of equal length.
        let edgeDisparityScore = (maxEdge - minEdge) / edgeLengths * 40;
        error += edgeDisparityScore;
      }

      // Before executing slow tests, check if this layout is already too unfit for them to matter.
      if(error > threshold) { return error; }

      // Prefer layouts without edge intersections.
      let intersections = 0;
      let edgeCount = this.edges.length;
      for(let ix = 0; ix < edgeCount; ix++) {
        let edge = this.edges[ix];

        if(this.sourcesById[edge.source].fixed && this.attributesById[edge.target].fixed) { continue; }
        let a1 = layout.positions[edge.source];
        let a2 = layout.positions[edge.target];
        let abb = pointsToBB(a1, a2);

        for(let otherIx = ix; otherIx < edgeCount; otherIx++) {
          let other = this.edges[otherIx];
          if(edge.source === other.source || edge.target === other.target) { continue; }
          let b1 = layout.positions[other.source];
          let b2 = layout.positions[other.target];
          let bbb = pointsToBB(b1, b2);
          if(intersectsBB(abb, bbb)) {
            intersections++;
            error += 100;
            if(error > threshold) { return error; }
          }
        }
      }
      return error;
    }
  }
}
