import {srand, sortByField} from "./utils";
import {Element, Handler} from "./microReact";

function sum(list:number[]):number {
  let total = 0;
  for(let num of list) total += num;
  return total;
}

interface MasonryLayout { size: number, grouped?: number, c: string }
interface MasonryTileElem extends Element { size?: number }
interface MasonryElem extends Element { seed?: number, rowSize?: number, children: MasonryTileElem[], layouts?:MasonryLayout[] }

let _layouts:MasonryLayout[] = [
  {size: 4, c: "tile.big"},
  {size: 2, c: "tile.detailed"},
  {size: 1, c: "tile", grouped: 2},
];
export function masonry(elem:MasonryElem):Element {
  let {seed = 0, rowSize = 8, layouts = _layouts, children} = elem;
  let rand = srand(seed);  
  let maxTileSize = 0;
  for(let tile of children) {
    tile.size = tile.size || 1;
    if(tile.size > maxTileSize) maxTileSize = tile.size;
  }
  children.sort(sortByField("size"));
  layouts.sort(sortByField("size"));
  let tilesPerLayout = [];
  let ix = 0;
  let totalLayoutSize = 0;
  for(let layout of layouts) totalLayoutSize += 1 / layout.size;
  for(let layout of layouts) tilesPerLayout[ix++] = Math.round(1 / layout.size / totalLayoutSize * children.length);

  let total;
  let tryIx = 0;
  // @FIXME: Depends on smallest layout size being 1.
  while((total = sum(tilesPerLayout)) !== children.length) {
    if(sum(tilesPerLayout) > children.length) tilesPerLayout[tilesPerLayout.length - 1] -= 1;
    else if(sum(tilesPerLayout) < children.length) tilesPerLayout[tilesPerLayout.length - 1] += 1;
  }

  // @TODO: Try running without optimization and see if the results are good enough
  // let minErr = Infinity;
  // while(tryIx < 1000 && minErr > 0.1) {
  //   console.log("IX", tryIx, "Err", minErr);
  //   let groupErr = 0;
  //   let groupAvg = sum(tilesPerLayout) / layouts.length;
  //   for(let group of tilesPerLayout) groupErr += Math.abs(group - groupAvg);
    
  //   let totalSize = 0;
  //   let layoutIx = 0;
  //   for(let layout of layouts) totalSize += layout.size * tilesPerLayout[layoutIx++];
  //   let rowCount = Math.ceil(totalSize / rowSize);
  //   let sizeErr = Math.abs(totalSize - rowSize * rowCount);

    
  //   let ix = Math.floor(rand() * layouts.length);
  //   if(total > children.length && tilesPerLayout[ix] > 0) tilesPerLayout[ix]--;
  //   else if(total < children.length) tilesPerLayout[ix]++;
  //   if(tryIx > 10000) break;
  // }
  console.log("TPL", tilesPerLayout);

  // @TODO: Pull tiles from bag to make complete rows, stick remainder into another row.
  
  let groups = [];
  let group;

  
  while(children.length) {
    if(!group) {
      group = {children: [], size: 0}; 
    }
    let ix = Math.floor(rand() * children.length);
    let tile = children.splice(ix, 1)[0];
  }
  
  elem.children = groups;
  return elem;
}

masonry({children: [
  {size: 1, text: "a"},
  {size: 7, text: "b"},
  {size: 2, text: "c"},
  {size: 3, text: "d"},
  {size: 5, text: "e"},
  {size: 3, text: "f"},
  {size: 2, text: "g"},
]});
