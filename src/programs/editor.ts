//--------------------------------------------------------------------
// Flappy
//--------------------------------------------------------------------

import {Program} from "../runtime/dsl2";
import {RawMap, RawValue, RawEAV} from "../watchers/watcher";
import {v4 as uuid} from "node-uuid";

//--------------------------------------------------------------------
// Utils
//--------------------------------------------------------------------

function isRawValue(x:any): x is RawValue {
  return x && (typeof x === "string" || typeof x === "number");
}

function isRawValueArray(x:any): x is RawValue[] {
  if(x && x.constructor === Array) {
    for(let value of x) {
      if(!isRawValue(value)) return false;
    }
    return true;
  }
  return false;
}

function isRawEAVArray(x:any): x is RawEAV[] {
  if(x && x.constructor === Array) {
    for(let value of x) {
      if(!isRawValueArray(value)) return false;
      if(value.length !== 3) return false;
    }
    return true;
  }
  return false;
}


interface Attrs extends RawMap<RawValue|RawValue[]|RawEAV[]|RawEAV[][]> {}
function appendAsEAVs(eavs:any[], record: Attrs, id = uuid()) {
  for(let attr in record) {
    let value = record[attr];
    if(isRawValue(value)) {
      eavs.push([id, attr, value]);

    } else if(isRawValueArray(value)) {
      // We have a set of scalars
      for(let val of value) eavs.push([id, attr, val]);

    } else if(isRawEAVArray(value)) {
      // We have a single nested sub-object (i.e. a set of EAVs).
      let childEavs = value;
      let [childId] = childEavs[0];
      eavs.push([id, attr, childId]);
      for(let childEav of childEavs) eavs.push(childEav);

    } else {
      // We have a set of nested sub-objects.
      for(let childEavs of value) {
        let [childId] = childEavs[0];
        eavs.push([id, attr, childId]);
        for(let childEav of childEavs) eavs.push(childEav);
      }
    }
  }

  return eavs;
}

//--------------------------------------------------------------------
// Program
//--------------------------------------------------------------------

let prog = new Program("editor");
prog.attach("ui");

//--------------------------------------------------------------------
// Root UI
//--------------------------------------------------------------------

prog
  .block("Draw the root editor view.", ({find, record}) => {
    let editor = find("editor/root");

    return [
      record("editor/view", "ui/row", {editor, class: "editor-view"}).add("children", [
        record("editor/nav", "ui/column", {editor, class: "editor-nav"}),
        record("ui/column", {editor, class: "editor-main"}).add("children", [
          record("ui/row", {editor, sort: 0, class: "editor-block-header"}).add("children", [
            record("editor/block/description", "ui/column", {editor, class: "editor-block-description"}),
            record("editor/block/storyboard", "ui/row", {editor, class: "editor-block-storyboard"})
          ]),
          record("ui/row", {editor, sort: 1, class: "editor-block-content"}).add("children", [
            record("editor/block/query", "ui/column", {editor, class: "editor-block-query"}),
            record("editor/block/canvas", "ui/column", {editor, class: "editor-block-canvas"})
          ])
        ])
      ])
    ];
  })

//--------------------------------------------------------------------
// Navigation
//--------------------------------------------------------------------

  .block("Populate the nav bar with the program's block tags.", ({find, record}) => {
    let nav = find("editor/nav");
    let tag = nav.editor.block.nav_tag;
    return [
      nav.add("children", [
        record("editor/nav/tag", "ui/column", {editor: nav.editor, sort: tag.name, nav_tag: tag, class: "editor-nav-tag"}).add("children", [
          record("ui/text", {sort: 0, text: tag.name})
        ])
      ])
    ];
  })

  .block("Populate nav tags with the blocks that have them.", ({find, choose, record}) => {
    let tagElem = find("editor/nav/tag");
    let block = tagElem.editor.block;
    block.nav_tag == tagElem.nav_tag;

    let [name] = choose(
      () => block.name,
      () => "Untitled Block"
    );

    return [
      tagElem.add("children", [
        record("editor/nav/block", "ui/text", {editor: tagElem.editor, nav_tag: tagElem.nav_tag, block, text: name, sort: name, class: "editor-nav-block"})
      ])
    ];
  })




//--------------------------------------------------------------------
// Block Description
//--------------------------------------------------------------------

prog.block("Populate the block description for the active block.", ({find, choose, record}) => {
  let descriptionElem = find("editor/block/description");
  let active_block = descriptionElem.editor.active_block;

  let [name] = choose(
    () => active_block.name,
    () => "Untitled Block"
  );

  let [description] = choose(
    () => active_block.description,
    () => ""
  );

  return [
    descriptionElem.add("children", [
      record("ui/text", {sort: 0, text: name, class: "editor-block-title"}),
      record("ui/text", {sort: 1, text: description})
    ])
  ];
});

//--------------------------------------------------------------------
// Block Frames
//--------------------------------------------------------------------

prog.block("Populate the block storyboard for the active block.", ({find, record}) => {
  let storyboardElem = find("editor/block/storyboard");
  let {editor} = storyboardElem;
  let {active_block} = editor;
  let frame = active_block.storyboard;
  return [
    storyboardElem.add("children", [
      record("editor/block/frame", "ui/column", {editor, sort: frame.sort, frame, class: "editor-block-frame"}).add("children", [
        record("ui/text", {text: frame.type})
      ])
    ])
  ];
});

prog.block("Add a 'new frame' button to the storyboard.", ({find, record}) => {
  let storyboardElem = find("editor/block/storyboard");
  let {editor} = storyboardElem;
  let {active_block} = editor;
  return [
    storyboardElem.add("children", [
      record("editor/new-frame", "ui/column", {editor, sort: Infinity, class: ["editor-block-frame", "editor-new-frame"]})
    ])
  ];
});

//--------------------------------------------------------------------
// Block Query
//--------------------------------------------------------------------

prog.block("Populate the block query for the active block.", ({find, record}) => {
  let queryElem = find("editor/block/query");
  let {editor} = queryElem;
  let {active_frame} = editor;
  let {node} = active_frame;
  return [
    queryElem.add("children", [
      record("ui/row", "editor/block/query-node", {editor, sort: node.sort, node, class: "editor-block-query-node"}).add("children", [
        record("shape/hexagon", "shape/outline", {side: 20, thickness: 2, border: "#AAA", background: "white", sort: 0, frame: active_frame, node, class: "editor-block-query-hex"}).add("content", [
          record("ui/text", {text: node.letter})
        ]),
        record("ui/column", {sort: 1, frame: active_frame, node, class: "editor-block-query-pattern"}).add("children", [
          record("ui/text", {sort: 0, text: node.queryTag, class: "editor-query-tag"}),
          record("ui/text", {sort: node.queryField, text: node.queryField, class: "editor-query-field"})
        ])
      ])
    ])
  ];
});

//--------------------------------------------------------------------
// Block Canvas
//--------------------------------------------------------------------

prog.block("Populate the block canvas with a hex grid.", ({find, lib:{math}, record}) => {
  let canvasElem = find("editor/block/canvas");
  let {editor} = canvasElem;

  let x_ix = find("range").ix;
  let y_ix = find("range").ix;


  let side = 20;
  let tri_height = side * 0.5;
  let tri_width = side * 0.86603;
  let width = 2 * tri_width;

  let x_offset = math.mod(y_ix, 2) * tri_width;
  let x = width * x_ix + x_offset;

  let height = side + tri_height;
  let y = height * y_ix;

  return [
    canvasElem.add("children", [
      record("shape/hexagon", "shape/outline", {side: 20, thickness: 2, background: "white", border: "#ccc", style: record({position: "absolute", top: y, left: x, "font-size": "0.5em"})}).add("content", [
        record("ui/text", {text: `${x_ix}, ${y_ix}`})
      ])
    ])
  ];
});



//--------------------------------------------------------------------
// Shared Components
//--------------------------------------------------------------------

prog.block("Draw a hexagon", ({find, choose, record, lib: {math}}) => {
  let hex = find("shape/hexagon");
  let {side} = hex;

  let tri_height = side * 0.5; // sin(30deg)
  let tri_width = side * 0.86603; // cos(30deg)
  let width = 2 * tri_width;

  let [background] = choose(
    () => {hex.tag == "shape/outline"; return hex.border},
    () =>  hex.background
  );

  let sideBorder = `${tri_width}px solid transparent`;
  let activeBorder = `${tri_height}px solid ${background}`;

  return [
    hex.add({tag: "html/element", tagname: "div", class: "shape-hexagon", style: record({width}), children: [
      record("shape/hexagon/cap", "html/element", {sort: 1, tagname: "div", class: "shape-hexagon-cap", style: record({
        width: 0, height: 0,
        "border-left": sideBorder, "border-right": sideBorder,
        "border-bottom": activeBorder,
      })}),
      record("shape/hexagon/body", "ui/column", {hex, sort: 2, style: record({height: side, width, background}), class: "shape-hexagon-body"}),
      record("shape/hexagon/cap", "html/element", {sort: 3, tagname: "div", class: "shape-hexagon-cap", style: record({
        width: 0, height: 0,
        "border-left": sideBorder, "border-right": sideBorder,
        "border-top": activeBorder,
      })}),
    ]})
  ];
});

prog.block("An outlined hexagon contains another hexagon inset by thickness.", ({find, record, lib: {math}}) => {
  let hex = find("shape/hexagon", "shape/outline");
  let {thickness} = hex;
  let side = hex.side - thickness;
  let side_thickness = thickness * 0.86603; // cos(30deg)
  return [
    hex.add("children", [
      record("shape/hexagon", "shape/hexagon/inner", {outer: hex, sort: 4, side, background: hex.background, class: "shape-hexagon-inner", style: record({
        position: "absolute", top: 0, left: 0, "margin-top": thickness, "margin-left": side_thickness
      })})
    ])
  ];
})

prog.block("Populate hexagon with content", ({find, not}) => {
  let hex_body = find("shape/hexagon/body");
  not(() => hex_body.hex.tag == "shape/outline")
  let {content} = hex_body.hex;
  return [
    hex_body.add("children", [
      content
    ])
  ];
})

prog.block("Populate an outlined hexagon's inner with content", ({find}) => {
  let hex_inner = find("shape/hexagon/inner");
  return [
    hex_inner.add("content", hex_inner.outer.content)
  ];
})

//--------------------------------------------------------------------
// Kick it off
//--------------------------------------------------------------------

const EDITOR_ID = uuid();
const STYLE_ID = uuid();

prog.inputEavs([
  [EDITOR_ID, "tag", "editor/root"],
  [STYLE_ID, "tag", "html/element"],
  [STYLE_ID, "tagname", "link"],
  [STYLE_ID, "rel", "stylesheet"],
  [STYLE_ID, "href", "assets/css/editor.css"],
]);

//--------------------------------------------------------------------
// Data Fixture
//--------------------------------------------------------------------

const TAG_MARINA_ID = uuid();
const TAG_MARINARA_ID = uuid();
const BLOCK_PPL_W_BOATS_ID = uuid();
const BLOCK_BOAT_TYPES_ID = uuid();
const FRAME_PPL_W_BOATS_QUERY_ID = uuid();

let fixture:RawEAV[] = [
  [EDITOR_ID, "block", BLOCK_PPL_W_BOATS_ID],
  [EDITOR_ID, "block", BLOCK_BOAT_TYPES_ID],
  [EDITOR_ID, "active_block",  BLOCK_PPL_W_BOATS_ID],
  [EDITOR_ID, "active_frame",  FRAME_PPL_W_BOATS_QUERY_ID]
];

// We can't do range yet.
appendAsEAVs(fixture, {
  tag: "range",
  ix: [1, 2, 3, 4, 5, 6]
});

appendAsEAVs(fixture, {
  name: "Marina"
}, TAG_MARINA_ID);

appendAsEAVs(fixture, {
  name: "Marinara"
}, TAG_MARINARA_ID);


appendAsEAVs(fixture, {
  tag: "editor/block",
  nav_tag: [TAG_MARINA_ID, TAG_MARINARA_ID],
  name: "People with boats",
  description: `Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.`,
  storyboard: [
    appendAsEAVs([], {
      tag: "editor/frame",
      type: "query",
      sort: 1,
      node: [
        appendAsEAVs([], {
          tag: "editor/query-node",
          type: "join",
          sort: 1,
          letter: "P",
          queryTag: "person",
          queryField: ["name", "age", "boat"]
        }),
        appendAsEAVs([], {
          tag: "editor/query-node",
          type: "join",
          sort: 1,
          letter: "B",
          queryTag: "boat",
          queryField: ["name", "type"]
        })
      ]
    }, FRAME_PPL_W_BOATS_QUERY_ID)
  ]
}, BLOCK_PPL_W_BOATS_ID);

appendAsEAVs(fixture, {
  tag: "editor/block",
  nav_tag: TAG_MARINA_ID,
  name: "Boat types",
  description: `It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English.`
}, BLOCK_BOAT_TYPES_ID);

prog.inputEavs(fixture);
