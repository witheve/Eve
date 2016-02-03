import {srand, shuffle, sortByField} from "./utils";
import {Element, Handler} from "./microReact";

function sum(list:number[]):number {
  let total = 0;
  for(let num of list) total += num;
  return total;
}

function vecmul(a:number[], b:number[]):number[] {
  if(!a || !b || a.length !== b.length) throw new Error("Lists must be same length");
  let result = [];
  for(let i = 0, len = a.length; i < len; i++) result[i] = a[i] * b[i];
  return result;
}

export interface MasonryLayout { size: number, freq?: number, grouped?: number, c: string, format?:(elem:MasonryTileElem) => MasonryTileElem }
interface MasonryTileElem extends Element { size?: number, layout?: MasonryLayout }
interface MasonryElem extends Element { seed?: number, rowSize?: number, children: MasonryTileElem[], layouts?:MasonryLayout[] }

let _layouts:MasonryLayout[] = [
  {size: 4, c: "big"},
  {size: 2, c: "detailed"},
  {size: 1, c: "normal", grouped: 2},
];
export function masonry(elem:MasonryElem):Element {
  let {seed = 0, rowSize = 8, layouts = _layouts, children} = elem;
  let rand = srand(seed);  
  layouts.sort(sortByField("size"));

  // Assign notional tiles an initial size based on the visual frequency of each layout
  let ix = 0;
  let tilesPerLayout = [];
  let totalLayoutFreq = 0;
  let sizes = [];
  for(let layout of layouts) {
    layout.freq = layout.freq || 1 / layout.size;
    totalLayoutFreq += layout.freq;
  }
  for(let layout of layouts) {
    sizes[ix] = layout.size;
    tilesPerLayout[ix++] = Math.round(layout.freq / totalLayoutFreq * children.length);
  }

  // Ensure every notional tile has an assigned size (to fix rounding errors)
  let total;
  let tryIx = 0;
  while((total = sum(tilesPerLayout)) !== children.length) {
    if(sum(tilesPerLayout) > children.length) tilesPerLayout[tilesPerLayout.length - 1] -= 1;
    else if(sum(tilesPerLayout) < children.length) tilesPerLayout[tilesPerLayout.length - 1] += 1;
  }

  // Optimize distribution of notional tiles to maximally fill rows
  tryIx = 0, ix = 0;
  let minSize = layouts[layouts.length - 1].size;
  while(true) {
    let filledSize = sum(vecmul(tilesPerLayout, sizes));
    let rowCount = Math.ceil(filledSize / rowSize);
    let delta = rowSize * rowCount - filledSize;
    if(delta <= 0 || tryIx++ > 1000) break;
    // Since we'll be shifting one of the smallest layout tiles to a bigger size, we offset by that size
    if(ix === layouts.length - 1) ix = 0;
    if(delta >= layouts[ix].size - minSize) {
      tilesPerLayout[layouts.length - 1]--;
      tilesPerLayout[ix]++;
    } else if(ix === layouts.length - 2) {
      // The second smallest size was still too large, we're done.
      break;
    }
    ix++;
  }

  // Assign discrete tiles to sizes based on their relative size ordering
  children.sort(sortByField("size"));
  let tiles = [], layoutIx = 0, tileIx = 0;
  for(let count of tilesPerLayout) {
    let layout = layouts[layoutIx++];
    if(!layout.grouped) {
      for(let ix = tileIx;  ix < tileIx + count; ix++) {
        let tile = children[ix];
        tile.c = `tile ${tile.c || ""} ${layout.c || ""}`;
        if(layout.format) tile = layout.format(tile);
        tiles.push({c: `group ${layout.c || ""}`, layout, size: layout.size, children: [tile]});
      }
    } else {
      // Grouped layouts are grouped at this stage to keep the layout process 1-dimensional
      let added = 0;;
      for(let ix = tileIx;  ix < tileIx + count; ix += layout.grouped) {
        let group = {c: `group ${layout.c || ""}`, layout, size: layout.size * layout.grouped, children: []};
        for(let partIx = 0; partIx < layout.grouped && added < count; partIx++) {
          let tile = children[ix + partIx];
          tile.c = `tile ${tile.c || ""} ${layout.c || ""}`;
          if(layout.format) tile = layout.format(tile);
          group.children.push(tile);
          added++;
        }
        tiles.push(group);
      }
    }
    tileIx += count;
  }

  // @TODO: Pull tiles from bag, distributing them evenly into rows
  let filledSize = sum(vecmul(tilesPerLayout, sizes));
  let rowCount = Math.ceil(filledSize / rowSize);
  let rows = [];
  for(let ix = 0; ix < rowCount; ix++) rows.push({c: "masonry-row", children: [], size: 0});
  tryIx = 0;
  let rowIx = 0;
  for(let tile of tiles) {
    let size = tile.layout.size * (tile.layout.grouped || 1);
    let placed = false;
    let attempts = 0;
    while(!placed) {
      let row = rows[rowIx];
      if(row.size + size <= rowSize) {
        row.size += size;
        row.children.push(tile);
        tile.debug = size;
        placed = true;
      }

      rowIx++;
      if(rowIx >= rowCount) rowIx = 0;
      attempts++;
      if(attempts === rowCount) break;
    }
    if(!placed) console.error("Could not place tile", tile);
  }
  ix = 0;
  // Shuffle the row contents and the set of rows for pleasing irregularity
  for(let row of rows) row.debug = `${ix++}|${row.size}`;
  for(let row of rows) shuffle(row.children, rand);
  shuffle(rows, rand);

  elem.c = `masonry ${elem.c || ""}`;
  elem.children = rows;
  return elem;
}
