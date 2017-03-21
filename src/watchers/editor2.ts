//--------------------------------------------------------------------
// Editor
//--------------------------------------------------------------------

import {Watcher, Program, RawMap, RawValue, RawEAV, forwardDiffs, appendAsEAVs, createId} from "../watchers/watcher";
import {CompilerWatcher} from "../watchers/compiler";

class EditorWatcher extends Watcher {
  editor: Program;
  setup() {
    this.editor = this.createEditor();
    let {editor, program} = this;

    editor
      .block("Draw the root editor view.", ({find, record}) => {
        let editor = find("editor/root");

        return [
          record("editor/view", "ui/row", {editor}).add("children", [
            record("editor/nav", "ui/column", {editor, sort: 0}),
            record("editor/main", "ui/column", {editor, sort: 1}).add("children", [
              record("ui/row", {editor, sort: 0, class: "editor-block-header"}).add("children", [
                record("editor/block/description", "ui/column", {editor}),
                record("editor/block/storyboard", "ui/row", {editor})
              ]),
              record("ui/row", "editor/block/content", {editor, sort: 1})
            ])
          ])
        ];
      })
      .block("Attach the current frame type to the editor content window.", ({find}) => {
        let editor = find("editor/root");
        let {active_frame} = editor;
        let content = find("editor/block/content", {editor});
        return [content.add("type", active_frame.type)];
      })

      .block("A block's next node sort is it's max node sort + 1 (or 1).", ({find, not}) => {
        // @FIXME: Hackaround busted sort.
        let block = find("block");
        let sibling = find("node");
        not(() => find("node").sort > sibling.sort);
        let sort = sibling.sort + 1;
        return [block.add("next_node_sort", sort)];
      })
      .block("With no nodes, a block's next sort is 1.", ({find, not}) => {
        // @FIXME: Hackaround busted sort.
        let block = find("block");
        not(() => block.next_node_sort != 1);
        return [block.add("next_node_sort", 1)];
      })

      .block("A node is another node's parent if it has an AV who's V is the other node's entity", ({find}) => {
        let parent = find("node");
        let node = find("node");
        node != parent;
        let {attribute} = parent;
        attribute.value == node.entity;
        return [node.add({parent, parent_field: attribute.attribute})];
      })

      .block("Mark nodes without parents as root nodes.", ({find, not}) => {
        let node = find("node");
        not(() => node.parent);
        return [node.add("tag", "root-node")];
      })

      .commit("A node with no entity creates one.", ({find, not, record}) => {
        let node = find("node");
        not(() => node.entity);
        return [node.add("entity", record("entity", {node, sort: node.sort}))];
      })

      .commit("If a node's attribute is a record and it's not already a subnode, fix that.", ({find, not, record}) => {
        let editor = find("editor/root");
        let {active_block} = editor;
        let {node} = active_block;
        let {attribute} = node;
        find("editor/existing-node-attribute", {node, text: attribute.attribute, is_record: "true"});
        not(() => attribute.value == find("node").entity);

        let sort = active_block.next_node_sort;

        let subnode;
        return [
          active_block.add("node", [
            subnode = record("node", "derived-subnode", {sort, entity: record("entity", {sort, _node: node, _attr: attribute.attribute})})
          ]),
          attribute.remove("value").add("value", subnode.entity)
        ];
      })

      .commit("Deriving a subnode closes it's parent and opens it.", ({find, record}) => {
        let node = find("node", "derived-subnode");
        let tree_node = find("editor/node-tree/node", {node});
        let parent_tree_node = find("editor/node-tree/node", {node: node.parent});
        return [
          node.remove("tag", "derived-subnode"),
          tree_node.add("open", "true"),
          parent_tree_node.remove("open")
        ];
      })

      .commit("A node with an empty value has no value at all.", ({find}) => {
        let node = find("node");
        let {attribute} = node;
        attribute.value == "";
        return [attribute.remove("value", "")];
      })

      .block("A node's name is it's parent_field if it has one, or it's tag attribute.", ({find, choose}) => {
        let node = find("node");
        let [name] = choose(
          () => node.parent_field,
          () => {
            let {attribute} = node;
            attribute.attribute == "tag";
            return attribute.value;
          },
          () => "???"
        );
        return [node.add("name", name)]
      })
      .block("A node's label is the uppercased first character of it's name.", ({find, lib:{string}}) => {
        let node = find("node");
        let {name} = node;
        let label = string.uppercase(string.get(name, 1));
        return [node.add("label", label)];
      })
      .block("A node's color is derived from it's sort.", ({find, lib:{math}}) => {
        let node = find("node");
        let {color} = find("node-color", {sort: math.mod(node.sort - 1, 5) + 1})
        return [node.add("color", color)];
      })

      .commit("Clear the specified autocomplete.", ({find}) => {
        let {autocomplete} = find("editor/event/clear-autocomplete");
        let input = find("ui/autocomplete/input", {autocomplete});
        return [input.remove("value")];
      })
      .commit("Blurring an autocomplete removes it's trigger-focus.", ({find, record}) => {
        let autocomplete = find("ui/autocomplete", "html/trigger-focus");
        let input = find("ui/autocomplete/input", {autocomplete});
        let event = find("html/event/blur", {element: input});
        return [autocomplete.remove("tag", "html/trigger-focus")];
      })

    // this.navigation();
    this.header();

    this.nodeTree();
    this.queryEditor();

    this.moleculeGenerator();
    this.moleculeLayout();

    this.fixtures();
    this.initEditor();
  }

  initEditor() {
    const EDITOR_ID = createId();
    const STYLE_ID = createId();

    const TAG_MARINA_ID = createId();
    const TAG_MARINARA_ID = createId();
    const BLOCK_PPL_W_BOATS_ID = createId();
    const BLOCK_BOAT_TYPES_ID = createId();
    const FRAME_PPL_W_BOATS_QUERY_ID = createId();

    let fixture:RawEAV[] = [
      [EDITOR_ID, "tag", "editor/root"],
      [STYLE_ID, "tag", "html/element"],
      [STYLE_ID, "tagname", "link"],
      [STYLE_ID, "rel", "stylesheet"],
      [STYLE_ID, "href", "assets/css/editor.css"],
      ["|init", "tag", "editor/init"]
    ];

    // @NOTE: To get successive layers, multiply offsets by magnitude = ceil(mod(ix - 2, 6) + 2)
    // @NOTE: Take special care about the 0,0, in ix: 1.
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 1, x: 0, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 2, x: 1, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 3, x: 1, y: 1});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 4, x: 0, y: 1});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 5, x: -1, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 6, x: 0, y: -1});
    appendAsEAVs(fixture, {tag: "spiral", row: 1, sort: 7, x: 1, y: -1});
    appendAsEAVs(fixture, {tag: "spiral", row: 8, sort: 8, x: 2, y: -1});

    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 1, x: 0, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 2, x: 1, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 3, x: 0, y: 1});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 4, x: -1, y: 1});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 5, x: -1, y: 0});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 6, x: -1, y: -1});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 7, x: 0, y: -1});
    appendAsEAVs(fixture, {tag: "spiral", row: 0, sort: 8, x: 1, y: -1});

    appendAsEAVs(fixture, {tag: "node-color", sort: 1, color: "#9926ea"});
    appendAsEAVs(fixture, {tag: "node-color", sort: 2, color: "#6c86ff"});
    appendAsEAVs(fixture, {tag: "node-color", sort: 3, color: "red"});
    appendAsEAVs(fixture, {tag: "node-color", sort: 4, color: "orange"});
    appendAsEAVs(fixture, {tag: "node-color", sort: 5, color: "green"});
    appendAsEAVs(fixture, {tag: "node-color", sort: 6, color: "indigo"});

    this.editor.inputEavs(fixture);
  }

  fixtures() {
    this.editor
      .commit("When the init tag is added, preload the system with sample data.", ({find, record}) => {
        let init = find("editor/init");
        let editor = find("editor/root");

        let block1, frame1, person_node, boat_node, dock_node;
        return [
          editor.add("block", [
            block1 = record("block", {sort: 1}).add({
              nav_tag: record("nav/tag", {name: "Marina"}),
              name: "People with boats",
              description: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.",
              storyboard: [
                frame1 = record("frame", {type: "query", sort: 1}),
                record("frame", {type: "output", sort: 2}),
              ],

              node: [
                // dock_node = record("node", {sort: 3, entity: record("entity", {z: 1})}).add("attribute", [
                //   record({attribute: "state", z: 11})
                // ]),
                // boat_node = record("node", {sort: 2, entity: record("entity", {z: 2})}).add("attribute", [
                //   record({attribute: "type", value: "yacht", z:21}),
                //   record({attribute: "name", z:22}),
                //   record({attribute: "dock", value: dock_node.entity, z:23})
                // ]),
                // person_node = record("node", {sort: 1, entity: record("entity", {z: 3})}).add("attribute", [
                //   record({attribute: "tag", value: "person", z:31}),
                //   // record({attribute: "tag"}),
                //   record({attribute: "age", z:32}),
                //   record({attribute: "boat", value: boat_node.entity, z:33})
                // ]),
              ]
            })
          ]),
          record("node", {sort: 0}), // Magic node. Do not remove. (Workaround sort bug)
          editor.add({active_block: block1, active_frame: frame1}),
          init.remove()
        ];
      })

      .commit("DEBUG: add some fake tag completions.", ({find, record}) => {
        find("editor/root");
        return [
          record("editor/existing-tag", {text: "person"}),
          record("editor/existing-tag", {text: "pet"}),
          record("editor/existing-tag", {text: "boat"}),
          record("editor/existing-tag", {text: "dock"}),
          record("editor/existing-tag", {text: "cat"}),
        ];
      })
      .block("DEBUG: add some fake node attribute completions.", ({find, record}) => {
        let tree_node = find("editor/node-tree/node");
        let {node} = tree_node;
        let completion = find("editor/existing-node-attribute");
        completion.name == node.name

        return [completion.add("node", node)];
      })
      .commit("DEBUG: add some fake node attribute completions.", ({find, record}) => {
        let tree_node = find("editor/node-tree/node");
        let {node} = tree_node;

        return [
          record("editor/existing-node-attribute", {name: "person", text: "name"}),
          record("editor/existing-node-attribute", {name: "person", text: "age"}),
          record("editor/existing-node-attribute", {name: "person", text: "boat", is_record: "true"}),
          record("editor/existing-node-attribute", {name: "person", text: "pet", is_record: "true"}),
          record("editor/existing-node-attribute", {name: "boat", text: "name"}),
          record("editor/existing-node-attribute", {name: "boat", text: "type"}),
          record("editor/existing-node-attribute", {name: "boat", text: "dock", is_record: "true"}),
          //record("editor/existing-node-attribute", {name: "boat", text: "tag"}),
          record("editor/existing-node-attribute", {name: "dock", text: "name"}),
          record("editor/existing-node-attribute", {name: "dock", text: "state"}),
          record("editor/existing-node-attribute", {name: "pet", text: "length"}),
          record("editor/existing-node-attribute", {name: "pet", text: "name"}),
        ];
      })

      .commit("DEBUG: Add a spiral range to iterate over when expanding the spiral.", ({find, record}) => {
        find("editor/root");
        return [
          record("spiral-range", {ix: 9}),
          record("spiral-range", {ix: 10}),
          record("spiral-range", {ix: 11}),
          record("spiral-range", {ix: 12}),
          record("spiral-range", {ix: 13}),
          record("spiral-range", {ix: 14}),
          record("spiral-range", {ix: 15}),
          record("spiral-range", {ix: 16}),

          record("range", {ix: 1}),
          record("range", {ix: 2}),
          record("range", {ix: 3}),
          record("range", {ix: 4}),
          record("range", {ix: 5}),
          record("range", {ix: 6}),
          record("range", {ix: 7}),
          record("range", {ix: 8}),
          record("range", {ix: 8}),
          record("range", {ix: 9}),
          record("range", {ix: 10}),
          record("range", {ix: 11}),
          record("range", {ix: 12}),
          record("range", {ix: 13}),
          record("range", {ix: 14}),
          record("range", {ix: 15}),
          record("range", {ix: 16}),
        ];
      })

      // .commit("DEBUG: Expand the spiral neighbors out statically (rather than on-demand)", ({find,  lib:{math}, choose, record}) => {
      //   let {ix} = find("spiral-range");
      //   let neighbor = math.mod(ix - 1, 6) + 1;
      //   let spiral = find("spiral", {row: 0, sort: neighbor});
      //   math.mod(ix - 1, 6) != 0;
      //   let mag = math.floor((ix - 2) / 6) + 1;
      //   return [record("spiral", {row: 0, sort: ix, x: spiral.x * mag, y: spiral.y * mag, mag})];
      // })

      // .commit("DEBUG: The last leg of a hex spiral is extra long.", ({find,  lib:{math}, choose, record}) => {
      //   let {ix} = find("spiral-range");
      //   let neighbor = math.mod(ix - 2, 6) + 2;
      //   let spiral = find("spiral", {row: 0, sort: neighbor});
      //   math.mod(ix - 1, 6) < 1;
      //   let mag = math.floor((ix - 2) / 6) + 2;
      //   return [record("spiral", {row: 0, sort: ix, x: spiral.x * mag, y: spiral.y * mag, mag, s_ix: ix})];
      // })

      // .block("DEBUG: Show spirals.", ({find, record}) => {
      //   let spiral = find("spiral");
      //   return [record("ui/text", {text: `spiral(${spiral.x}, ${spiral.y}), ${spiral.mag}`})];
      // })

      // .block("DEBUG: Show spiral grid.", ({find, lib:{math}, choose, record}) => {
      //   let {ix} = find("range");
      //   let spiral = find("spiral", {row: 0, sort: ix});
      //   let {x, y} = spiral;
      //   let [s_ix] = choose(() => math.mod(spiral.s_ix - 1, 5) + 1, () => math.mod(spiral.sort - 1, 5) + 1);
      //   let fillStyle = find("node-color", {sort: s_ix}).color;

      //   return [
      //     record("shape/hex-grid", {side: 20, gap: 5, style: record({position:"absolute", left: 300, top: 300})}).add("cell", [
      //       record("shape/hexagon", {side: 20, x, y, sort: ix, fillStyle}).add("content", [
      //         record("ui/text", {text: ix})
      //       ])
      //     ])
      //   ];
      // })
  }

  createEditor() {
    let editor = new Program("Editor");
    editor.attach("compiler");

    editor.attach("ui");
    editor.attach("shape");

    let compiler = editor.attach("compiler") as CompilerWatcher;
    compiler.injectInto(this.program);
    compiler.registerWatcherFunction("send-to-editor", forwardDiffs(editor, "send-to-editor", true));

    return editor;
  }

  //--------------------------------------------------------------------
  // Navigation
  //--------------------------------------------------------------------

  navigation() {
    this.editor
      .block("Populate the nav bar with the program's block tags.", ({find, record}) => {
        let nav = find("editor/nav");
        let tag = nav.editor.block.nav_tag;
        return [
          nav.add("children", [
            record("editor/nav/tag", "ui/column", {editor: nav.editor, sort: tag.name, nav_tag: tag}).add("children", [
              record("ui/text", {sort: 0, text: tag.name})
            ])
          ])
        ];
      })

      .block("Populate nav tags with the blocks that have them.", ({find, choose, record}) => {
        let tag = find("editor/nav/tag");
        let block = tag.editor.block;
        block.nav_tag == tag.nav_tag;

        let [name] = choose(() => block.name, () => "Untitled Block");

        return [
          tag.add("children", [
            record("editor/nav/block", "ui/text", {editor: tag.editor, nav_tag: tag.nav_tag, block, text: name, sort: name})
          ])
        ];
      });
  }

  //--------------------------------------------------------------------
  // Header
  //--------------------------------------------------------------------

  header() {
    this.editor
      .block("Populate the block description for the active block.", ({find, choose, record}) => {
        let description = find("editor/block/description");
        let active_block = description.editor.active_block;

        let [name] = choose(() => active_block.name, () => "Untitled Block");
        let [text] = choose(() => active_block.description, () => "");

        return [
          description.add("children", [
            record("ui/text", {sort: 0, text: name, class: "editor-block-title"}),
            record("ui/text", {sort: 1, text})
          ])
        ];
      })

      .block("Populate the block storyboard for the active block.", ({find, record}) => {
        let storyboard = find("editor/block/storyboard");
        let {editor} = storyboard;
        let {active_block} = editor;
        let frame = active_block.storyboard;
        return [
          storyboard.add("children", [
            record("editor/block/frame", "ui/column", {editor, sort: frame.sort, frame}).add("children", [
              record("ui/text", {text: frame.type})
            ])
          ])
        ];
      })

      .block("Mark the active frame.", ({find}) => {
        let editor = find("editor/root");
        let {active_frame:frame} = editor;
        let frame_elem = find("editor/block/frame", {frame});
        return [frame_elem.add("class", "active")];
      })

      .commit("Clicking a frame activates it.", ({find}) => {
        let frame_elem = find("editor/block/frame");
        find("html/event/click", {element: frame_elem});
        let {frame, editor} = frame_elem;
        return [editor.remove("active_frame").add("active_frame", frame)];
      })

      .block("Addnew frame button to the storyboard.", ({find, record}) => {
        let storyboard = find("editor/block/storyboard");
        let {editor} = storyboard;
        let {active_block} = editor;
        return [
          storyboard.add("children", [
            record("editor/new-frame", "editor/block/frame", "ui/column", {editor, sort: Infinity})
          ])
        ];
      })

      .commit("Clicking the new frame button opens it.", ({find}) => {
        let new_frame = find("editor/new-frame");
        find("html/event/click", "html/direct-target", {element: new_frame});
        return [
          new_frame.add("open", "true")
        ];
      })

      .block("When the new frame is open, display a list of editor types to choose from.", ({find, record}) => {
        let new_frame = find("editor/new-frame", {open: "true"});
        let {editor} = new_frame;
        return [
          new_frame.add("children", [
            record("editor/new-frame/type", "ui/button", {editor, text: "Query", type: "query", class: "flat"}),
            record("editor/new-frame/type", "ui/button", {editor, text: "Output", type: "output", class: "flat"}),
          ])
        ];
      })

      .commit("Clicking a new frame type adds a frame of that type and closes the new frame button.", ({find, gather, choose, record}) => {
        let new_frame_type = find("editor/new-frame/type");
        find("html/event/click", "html/direct-target", {element: new_frame_type});
        let {type, editor} = new_frame_type;
        let new_frame = find("editor/new-frame", {editor});
        let {active_block:block} = editor;
        let [ix] = choose(() => gather(block.storyboard).per(block).count() + 1, () => 1);
        return [
          new_frame.remove("open"),
          block.add("storyboard", [
            record("frame", {block, type, sort: ix})
          ])
        ];
      });
  }

  //--------------------------------------------------------------------
  // Node Tree
  //--------------------------------------------------------------------

  nodeTree() {
    this.editor
      .block("Decorate the node tree as a column.", ({find, record}) => {
        let tree = find("editor/node-tree");
        let side = 21, lineWidth = 1, strokeStyle = "#AAA";
        return [tree.add({tag: "ui/column"}).add("children", [
          record("editor/node-tree/node", "editor/node-tree/node/new", "ui/row", {sort: Infinity, tree}).add("children", [
            record("editor/node-tree/node/hex", "shape/hexagon", {
              sort: 0, tree, side, lineWidth, strokeStyle
            }).add("content", [
              record("ui/button", {icon: "android-add"})
            ])
          ])
        ])];
      })

      .block("When the new node is open, it has an input for specifying the tag.", ({find, record}) => {
        let new_node = find("editor/node-tree/node/new", {open: "true"});
        return [
          new_node.add("children", [
            record("editor/node-tree/node/new/tag", "ui/autocomplete", "html/trigger-focus", {sort: 2, new_node, placeholder: "tag..."}),
            // record("editor/node-tree/node/new/save", "ui/button", {sort: 3, new_node, icon: "android-add"})
          ])
        ];
      })

      .block("Each root node is an element in the tree.", ({find, record}) => {
        let tree = find("editor/node-tree");
        let {node} = tree;
        node.tag == "root-node";
        return [
          tree.add("children", [
            record("editor/node-tree/node", {tree, node, sort: node.sort})
          ])
        ];
      })

      .block("A node consists of a hex, and a pattern.", ({find, record}) => {
        let tree_node = find("editor/node-tree/node");
        let {tree, node} = tree_node;
        let {color, label} = node;
        let side = 21, lineWidth = 1, strokeStyle = "#AAA";
        return [
          tree_node.add({tag: "ui/row"}).add("children", [
            record("editor/node-tree/node/hex", "shape/hexagon", {sort: 0, tree_node, side, lineWidth, strokeStyle}).add("content", [
              record("ui/text", {text: label, style: record({color})})
            ]),
            record("editor/node-tree/node/pattern", {sort: 1, tree_node})
          ])
        ];
      })

      .block("A node pattern is a column of fields on the node.", ({find, record}) => {
        let node_pattern = find("editor/node-tree/node/pattern");
        let {tree_node} = node_pattern;
        let {name} = tree_node.node;

        return [
          node_pattern.add({tag: "ui/column"}).add("children", [
            record("ui/row", {sort: 0, node_pattern}).add("children", [
              record("editor/node-tree/node/pattern/name", "ui/text", {tree_node, text: name})
            ])
          ])
        ];
      })

      .block("If a node has attributes, display them in it's pattern.", ({find, not, choose, record}) => {
        let node_pattern = find("editor/node-tree/node/pattern");
        let {tree_node} = node_pattern;
        let {node} = tree_node;
        let {attribute} = node;
        not(() => {attribute.attribute == "tag"; attribute.value == node.name});
        not(() => attribute.value == find("entity"));
        let [sort] = choose(() => `z${attribute.sort}`, () => attribute.attribute, () => 999);
        return [
          node_pattern.add("children", [
            record("editor/node-tree/fields", "ui/column", {sort: 1, tree_node, attribute}).add("children", [
              record("editor/node-tree/node/pattern/field", "ui/row", {sort, tree_node, attribute})
            ])
          ])
        ];
      })
      .block("A node displays attributes as text", ({find, record}) => {
        let pattern_field = find("editor/node-tree/node/pattern/field");
        let {tree_node, attribute} = pattern_field;
        let field = attribute.attribute;
        return [
          pattern_field.add("children", [
            record("ui/text", {sort: 1, text: field})
          ])
        ];
      })

      .block("If a node's attribute has a value, display them in it's field.", ({find, not, record}) => {
        let field = find("editor/node-tree/node/pattern/field");
        let {tree_node, attribute} = field;
        let {node} = tree_node;
        not(() => field.open);
        not(() => {attribute.attribute == "tag"; attribute.value == node.name});
        return [
          field.add("children", [
            record("editor/node-tree/node/pattern/value", "ui/text", {sort: 2, tree_node, text: attribute.value})
          ])
        ];
      })

      .block("An open field has a value cell even if it's attribute lacks one.", ({find, choose, record}) => {
        let field = find("editor/node-tree/node/pattern/field", {open: "true"});
        let {tree_node, attribute} = field;
        let [value] = choose(() => attribute.value, () => "");
        return [
          field.add("children", [
            record("editor/node-tree/node/pattern/value", "ui/input", "html/trigger-focus", "html/autosize-input", {sort: 2, tree_node, attribute, initial: value})
          ])
        ];
      })

      .block("An open node displays controls beneath itself.", ({find, record}) => {
        let tree_node = find("editor/node-tree/node", {open: "true"});
        let hex = find("editor/node-tree/node/hex", {tree_node});
        return [
          hex.add("children", [
            record("editor/node-tree/node/controls", "ui/row", {tree_node}).add("children", [
              //record("editor/node-tree/node/add-field", "ui/button", {sort: 1, tree_node, icon: "android-add"}),
              record("editor/node-tree/node/delete", "ui/button", {sort: 2, tree_node, icon: "android-close"})
            ])
          ])
        ];
      })

      .block("An open node displays delete buttons on its fields.", ({find, choose, record}) => {
        let field = find("editor/node-tree/node/pattern/field");
        let {tree_node, attribute} = field;
        tree_node.open;
        return [
          field.add("children", [
            record("editor/node-tree/node/field/delete", "ui/button", {sort: 0, tree_node, attribute, icon: "android-close"})
          ])
        ];
      })

      .block("An open node displays a plus field button in its pattern.", ({find, record}) => {
        let tree_node = find("editor/node-tree/node", {open: "true"});
        let node_pattern = find("editor/node-tree/node/pattern", {tree_node});
        return [
          node_pattern.add("children", [
            record("ui/column", {sort: 2, node_pattern, class: "editor-node-tree-new-field"}).add("children", [
              record("editor/node-tree/node/pattern/new-field", "ui/row", {tree_node}).add("children", [
                record("editor/node-tree/node/field/new", "ui/button", {sort: 1, tree_node, icon: "android-add"}),
                record("editor/node-tree/node/field/new/attribute", "ui/autocomplete", {sort: 2, tree_node, placeholder: "field..."}),
              ])
            ])
          ])
        ];
      })

      .block("Non root nodes are children of their parent's pattern.", ({find, record}) => {
        let node = find("node");
        let {parent} = node;
        let tree_node = find("editor/node-tree/node", {node: parent});
        let node_pattern = find("editor/node-tree/node/pattern", {tree_node});
        let {tree} = tree_node;
        tree.node == node;

        return [
          node_pattern.add("children", [
            record("ui/column", {sort: 3, node_pattern: node_pattern, class: "editor-node-tree-subnodes"}).add("children", [
              record("editor/node-tree/node", {tree, node, sort: node.sort})
            ])
          ])
        ];
      })

      .block("Fill tag completions.", ({find, record}) => {
        let new_tag = find("editor/node-tree/node/new/tag");
        let completion = find("editor/existing-tag");
        return [new_tag.add("completion", completion)];
      })

      .block("Fill attribute completions.", ({find, record}) => {
        let new_attribute = find("editor/node-tree/node/field/new/attribute");
        let {tree_node} = new_attribute;
        let completion = find("editor/existing-node-attribute", {node: tree_node.node});
        return [new_attribute.add("completion", completion)];
      })

    //--------------------------------------------------------------------
    // Node Tree Interaction
    //--------------------------------------------------------------------
    this.editor
      .commit("Clicking a node's hex opens it.", ({find, not}) => {
        let hex = find("editor/node-tree/node/hex");
        find("html/event/click", {element: hex});
        let {tree_node} = hex;
        not(() => tree_node.open);
        return [tree_node.add("open", "true")];
      })
      .commit("Clicking a node's name opens it.", ({find, not}) => {
        let name_elem = find("editor/node-tree/node/pattern/name");
        find("html/event/click", {element: name_elem});
        let {tree_node} = name_elem;
        not(() => tree_node.open);
        return [tree_node.add("open", "true")];
      })
      .commit("Clicking an open node's hex closes it.", ({find}) => {
        let hex = find("editor/node-tree/node/hex");
        find("html/event/click", {element: hex});
        let {tree_node} = hex;
        tree_node.open;
        return [tree_node.remove("open")];
      })
      .commit("Clicking outside an open tree node closes it.", ({find, not}) => {
        let tree_node = find("editor/node-tree/node", {open: "true"});
        find("html/event/click");
        not(() =>  find("html/event/click", {element: tree_node}));
        return [tree_node.remove("open")];
      })
      .commit("Clicking inside a child node of an open tree node closes it.", ({find}) => {
        let tree_node = find("editor/node-tree/node", {open: "true"});
        let child_node = find("editor/node-tree/node");
        child_node.node.parent == tree_node.node;
        find("html/event/click", {element: child_node});
        return [tree_node.remove("open")];
      })

      .block("Clicking the delete node button removes its node from the block.", ({find, record}) => {
        let delete_node = find("editor/node-tree/node/delete");
        find("html/event/click", {element: delete_node})
        let {tree_node} = delete_node;
        let {node} = tree_node;
        return [record("editor/event/delete-node", {node})];
      })
      .block("Deleting a node deletes its children.", ({find, choose, gather, record}) => {
        let {node:parent} = find("editor/event/delete-node");
        let node = find("node", {parent});
        return [record("editor/event/delete-node", {node})];
      })
      .commit("Deleting a node nukes it and removes it from it's blocks.", ({find, choose, gather, record}) => {
        let {node} = find("editor/event/delete-node");
        let {block} = find("editor/root");
        return [
          block.remove("node", node),
          node.remove()
        ];
      })
      .commit("Deleting a node removes it from its parent.", ({find, choose, gather, record}) => {
        let {node:child} = find("editor/event/delete-node");
        let node = find("node");
        let {attribute} = node;
        attribute.value == child.entity;
        return [
          node.remove("attribute", attribute),
          //attribute.remove()
        ];
      })

      .commit("Clicking the new node button opens it.", ({find, not, record}) => {
        let new_node = find("editor/node-tree/node/new");
        not(() => new_node.open);
        find("html/event/click", {element: new_node})
        return [new_node.add("open", "true")];
      })
      .commit("Clicking outside an open new node closes it.", ({find, not, record}) => {
        let new_node = find("editor/node-tree/node/new", {open: "true"});
        find("html/event/click");
        not(() =>  find("html/event/click", {element: new_node}));
        return [new_node.remove("open")];
      })
      .block("Clicking the new node save button saves it.", ({find, not, record}) => {
        let save_new = find("editor/node-tree/node/new/save");
        find("html/event/click", {element: save_new});
        let {new_node} = save_new;
        return [record("editor/event/save-node", {new_node})];
      })
      .block("selecting a tag in the new node autocomplete saves it.", ({find, not, record}) => {
        let tag_autocomplete = find("editor/node-tree/node/new/tag");
        let {new_node, selected} = tag_autocomplete;
        return [record("editor/event/save-node", {new_node})];
      })
      .commit("Saving a new node commits, resets, and closes it.", ({find, not, record}) => {
        let {new_node} = find("editor/event/save-node");
        let tag_autocomplete = find("editor/node-tree/node/new/tag");
        let {value} = tag_autocomplete;
        let tag_input = find("ui/autocomplete/input", {autocomplete: tag_autocomplete});
        value != "";
        let {tree} = new_node;
        let {active_block} = tree.editor;
        let sort = active_block.next_node_sort;

        return [
          active_block.add("node", [
            record("node", {sort, attribute: record({sort, attribute: "tag", value})})
          ]),
          new_node.remove("open"),
          tag_input.remove("value")
        ];
      })

      .commit("Clicking a field opens it.", ({find, not}) => {
        let field = find("editor/node-tree/node/pattern/field");
        find("html/event/click", {element: field});
        not(() => field.open);
        return [field.add("open", "true")];
      })
      .commit("Clicking outside an open field closes it.", ({find, not}) => {
        let field = find("editor/node-tree/node/pattern/field", {open: "true"});
        find("html/event/click");
        not(() =>  find("html/event/click", {element: field}));
        return [field.remove("open")];
      })

      .commit("Clicking the new field save button focuses it's autocomplete.", ({find}) => {
        let add_field = find("editor/node-tree/node/field/new");
        let {tree_node} = add_field;
        let event = find("html/event/click", {element: add_field})
        let field_autocomplete = find("editor/node-tree/node/field/new/attribute", {tree_node});
        return [field_autocomplete.add("tag", "html/trigger-focus")];
      })

      .block("Clicking the new field save button saves it.", ({find, record}) => {
        let add_field = find("editor/node-tree/node/field/new");
        let event = find("html/event/click", {element: add_field})
        let {tree_node} = add_field;
        let field_autocomplete = find("editor/node-tree/node/field/new/attribute", {tree_node});
        field_autocomplete.value != "";
        return [
          record("editor/event/save-field", {node: tree_node.node, attribute: field_autocomplete.value}),
          record("editor/event/clear-autocomplete", {autocomplete: field_autocomplete})
        ];
      })
      .block("Selecting a completion in the new field autocomplete saves it.", ({find, not, record}) => {
        let field_autocomplete = find("editor/node-tree/node/field/new/attribute");
        let {tree_node, selected} = field_autocomplete;
        return [
          record("editor/event/save-field", {node: tree_node.node, attribute: selected.text}),
          record("editor/event/clear-autocomplete", {autocomplete: field_autocomplete})
        ];
      })

      .commit("Saving a new field adds a new attribute to the node.", ({find, choose, gather, record}) => {
        let {node, attribute} = find("editor/event/save-field");
        attribute != "";

        // @FIXME: busted as frig...
        // let [count] = choose(() => {
        //   let {attribute} = node;
        //   1 == gather(attribute.sort).per(node).sort("down");
        //   return attribute.sort + 1;
        // }, () => 1);
        return [node.add("attribute", record("node/attribute", {sort: "@FIXME", attribute}))];
      })
      .commit("Clicking the delete field button removes its attribute from the node.", ({find, choose, gather, record}) => {
        let delete_field = find("editor/node-tree/node/field/delete");
        find("html/event/click", {element: delete_field})
        let {tree_node, attribute} = delete_field;
        let {node} = tree_node;
        return [
          node.remove("attribute", attribute),
          attribute.remove()
        ];
      })

      .block("Blurring a field's value input saves it.", ({find, record}) => {
        let field_value = find("editor/node-tree/node/pattern/value");
        let {value} = find("html/event/blur", {element: field_value});
        let {tree_node, attribute} = field_value;
        return [record("editor/event/save-value", {tree_node, attribute, value})];
      })
      .commit("Saving a field value commits it to the attribute.", ({find, record}) => {
        let {attribute, value} = find("editor/event/save-value");
        return [attribute.remove("value").add("value", value)];
      })
  }

  //--------------------------------------------------------------------
  // Query Editor
  //--------------------------------------------------------------------

  queryEditor() {
    this.editor
      .block("Display a node tree for the active block.", ({find, record}) => {
        let content = find("editor/block/content", {type: "query"});
        let {editor} = content;
        return [
          content.add("children", [
            record("editor/node-tree", "editor/query-tree", {sort: 1, editor}),
            record("editor/molecule-list", "editor/query-molecules", {sort: 2, editor})
          ])
        ]
      })
      .block("Fill the tree with the active block's nodes.", ({find, record}) => {
        let node_tree = find("editor/query-tree");
        let {editor} = node_tree;
        return [node_tree.add("node", editor.active_block.node)];
      })
      .block("Fill the list with the active block's molecules.", ({find, record}) => {
        let molecule_list = find("editor/query-molecules");
        let {editor} = molecule_list;
        let molecule = find("editor/molecule", {block: editor.active_block})
        return [molecule_list.add("molecule", molecule)];
      })
  }

  //--------------------------------------------------------------------
  // Molecule Generator
  //--------------------------------------------------------------------

  moleculeGenerator() {
    this.editor
      .block("Create a molecule generator for the active block if it has any nodes.", ({find, record}) => {
        let editor = find("editor/root");
        let {active_block:block} = editor;
        block.node.attribute;
        return [
          block.add("molecule_generator", [
            record("editor/molecule/generator", "eve/compiler/block", {block, name: "Generate molecules.", type: "watch", watcher: "send-to-editor"})
          ])
        ];
      })
      .block("Create an atom record and output for each node of the block with attributes.", ({find, record}) => {
        let generator = find("editor/molecule/generator");
        let {block} = generator;
        let {node} = block;
        return [
          node.entity.add("tag", "eve/compiler/var"),
          generator.add("constraint", [
            record("editor/atom/record", "eve/compiler/record", {generator, node, record: node.entity}).add("attribute", [
              //@FIXME: Bogus scan to hint to the compiler watcher that it shouldn't try to gen an id.
              record({attribute: "tag", value: record("editor/bogus-var", "eve/compiler/var", {node})})
            ]),
            record("editor/atom/output", "eve/compiler/output", {
              generator, node, record: record("editor/atom/output/entity", "eve/compiler/var", {node})
            }).add("attribute", [
              record({attribute: "tag", value: "editor/atom"}),
              record({attribute: "record", value: node.entity}),
              record({attribute: "node", value: node})
            ]),
            record("editor/record/output", "eve/compiler/output", {generator, node, record: node.entity}).add("attribute", [
              record({attribute: "tag", value: "editor/record"})
            ])
          ])
        ];
      })
      .block("Attributes with no value are free fields.", ({find, not, record}) => {
        let generator = find("editor/molecule/generator");
        let {block} = generator;
        let {node} = block;
        let {attribute} = node;
        not(() => attribute.value);
        return [record("editor/molecule/free-field", "eve/compiler/var", {node, attribute})];
      })
      .block("Attach attributes to atom records and outputs.", ({find, choose, record}) => {
        let atom_record = find("editor/atom/record");
        let {generator, node} = atom_record;
        let record_output = find("editor/record/output", {node});
        let {attribute} = node;
        let [value] = choose(
          () => attribute.value,
          () => find("editor/molecule/free-field", {node, attribute})
        );
        let [identifying] = choose(
          () => { attribute.value == find("node").entity; return "eve/compiler/attribute/non-identity"; },
          () => "eve/compiler/attribute/identity"
        );

        return [
          atom_record.add("attribute", record({attribute: attribute.attribute, value})),
          record_output.add("attribute", [
            record({tag: identifying, attribute: attribute.attribute, value}),
          ])
        ];
      })
      .block("Create a molecule output for each root node.", ({find, record}) => {
        let generator = find("editor/molecule/generator");
        let {block} = generator;
        let {node} = block;
        node.tag == "root-node";
        let atom_output_entity = find("editor/atom/output/entity", {node});
        let molecule_entity;
        return [
          molecule_entity = record("editor/molecule/entity", "eve/compiler/var", {node}),
          generator.add("constraint", [
            record("editor/molecule/output", "eve/compiler/output", {generator, node, record: molecule_entity})
              .add("parent", node)
              .add("attribute", [
                record({attribute: "atom", value: atom_output_entity}),
                record({attribute: "tag", value: "editor/molecule"}),
                record({attribute: "block", value: block}),
                record("editor/mol-av", {attribute: "node", value: node}),
              ])
          ])
        ];
      })

      .block("Attach subnode atoms to their parent's molecules.", ({find, record}) => {
        let molecule = find("editor/molecule/output");
        let {generator} = molecule;
        let {block} = generator;
        let {node} = block;
        node.parent == molecule.parent;
        let atom_output_entity = find("editor/atom/output/entity", {node});
        return [
          molecule.add({
            parent: node,
            attribute: record("eve/compiler/attribute/non-identity", {attribute: "atom", value: atom_output_entity})
          })
        ];
      })
  }

  //--------------------------------------------------------------------
  // Molecule Layout
  //--------------------------------------------------------------------

  moleculeLayout() {
    this.editor
      .block("Decorate a molecule list.", ({find}) => {
        let molecule_list = find("editor/molecule-list");
        return [molecule_list.add({tag: "ui/row"})];
      })

      .block("Draw some molecules.", ({find, record}) => {
        let molecule_list = find("editor/molecule-list");
        let {molecule} = molecule_list;
        let {atom} = molecule;
        let side = 21;
        let molecule_cell;
        return [
          molecule_list.add("children", [
            molecule_cell = record("editor/molecule-list/molecule", "html/element", "html/onmouseenter", "html/onmouseleave", {tagname: "div", molecule_list, molecule}),
            molecule_cell.add("children", [
              record("editor/molecule-list/molecule/grid", "shape/hex-grid", {molecule_cell, molecule, side, gap: 5})
            ]),
          ])
        ];
      })

      .block("Add cells to molecules.", ({find, record}) => {
        let molecule_grid = find("editor/molecule-list/molecule/grid");
        let {molecule_cell} = molecule_grid;
        let {molecule} = molecule_cell;
        let {atom} = molecule;
        let side = 21;
        return [
          molecule_grid.add("cell", [
            record("editor/molecule-list/molecule/cell", {molecule_cell, molecule, atom, side})
          ])
        ];
      })

      .block("A molecule's size is it's largest atom sort.", ({find, not, record}) => {
        let cell = find("editor/molecule-list/molecule/cell");
        let {molecule_cell} = cell;
        not(() => {
          let other_cell = find("editor/molecule-list/molecule/cell", {molecule_cell});
          other_cell.sort > cell.sort
        });
        return [
          molecule_cell.add("size", cell.sort),
        ];
      })

      .block("HACK: workaround double choose bug offset + mag.", ({find, lib:{math}, choose, record}) => {
        let molecule_cell = find("editor/molecule-list/molecule");
        let {size} = molecule_cell;
        // @FIXME: This isn't quite right due to 0,0 offset
        let offset = math.mod(size - 1, 6);
        // @FIXME: this measure doesn't take into account the fact that shell size increases...
        let mag = math.floor((size - 1) / 7) + 1;
        return [
          molecule_cell.add({offset, mag}),
        ];
      })

      // .block("HACK: workaround double choose bug width offset == 0.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   offset == 0;
      //   let cell_width = 28 + 5;
      //   let w = cell_width;
      //   return [molecule_cell.add("width", w * mag)];
      // })
      // .block("HACK: workaround double choose bug width offset < 3.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   0 < offset; offset < 3;
      //   let cell_width = 28 + 5;
      //   let w = cell_width * 2;
      //   return [molecule_cell.add("width", w * mag)];
      // })
      // .block("HACK: workaround double choose bug width offset == 3.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   offset == 3;
      //   let cell_width = 28 + 5;
      //   let w = cell_width * 2.5;
      //   return [molecule_cell.add("width", w * mag)];
      // })
      // .block("HACK: workaround double choose bug width offset > 3.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   3 < offset;
      //   let cell_width = 28 + 5;
      //   let w = cell_width * 3;
      //   return [molecule_cell.add("width", w * mag)];
      // })

      // .block("HACK: workaround double choose bug height offset < 2.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   offset < 2;
      //   let cell_height = 32 + 5;
      //   let h = cell_height;
      //   return [molecule_cell.add("height", h * mag)];
      // })
      // .block("HACK: workaround double choose bug height offset < 5.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   2 <= offset; offset < 5;
      //   let cell_height = 32 + 5;
      //   let h = cell_height * 2;
      //   return [molecule_cell.add("height", h * mag)];
      // })
      // .block("HACK: workaround double choose bug height offset >= 5.", ({find, choose, record}) => {
      //   let molecule_cell = find("editor/molecule-list/molecule");
      //   let {offset, mag} = molecule_cell;
      //   5 <= offset;
      //   let cell_height = 32 + 5;
      //   let h = cell_height * 3;
      //   return [molecule_cell.add("height", h * mag)];
      // })

      .block("A molecule's width and height are derived from it's size.", ({find, lib:{math}, choose, record}) => {
        let molecule_cell = find("editor/molecule-list/molecule");
        let {offset, mag} = molecule_cell;
        let cell_width = 39 + 5;
        let cell_height = 44 + 5;
        let width = cell_width * 3 * mag;
        let height = cell_height * 3 * mag;
        let padLeft = width / 2 - cell_width / 2;
        let padTop = height / 2 - cell_height / 2;
        return [
          molecule_cell.add("style", record({width: width, height: height, "padding-left": padLeft, "padding-top": padTop}))
        ];
      })

      .block("Populate atom cells from their atoms.", ({find, choose, record}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell");
        let {molecule_cell, molecule, atom, side, x, y} = atom_cell;
        let {node} = atom;
        let lineWidth = 1; //, strokeStyle = "#AAA";
        let [strokeStyle] = choose(
          () => {atom_cell.open; return "#4444ff"},
          () => {atom_cell.tag == "html/hovered"; return "#4444ff"},
          () => {molecule_cell.tag == "html/hovered"; return "#aaaaff"},
          () => "#aaa"
        );
        return [
          atom_cell.add({tag: ["shape/hexagon", "html/onmouseenter", "html/onmouseleave"],  side, lineWidth, strokeStyle, x, y}).add("content", [
            record("ui/text", {atom_cell, text: node.label, style: record({color: node.color})})
          ])
        ];
      })

      .block("Sort atoms by id.", ({find, gather, record}) => {
        let atom = find("editor/atom");
        let molecule = find("editor/molecule", {atom});
        let {node} = atom;
        let ix = gather(node.sort, atom).per(molecule).sort();
        return [atom.add("sort", ix)];
      })

      .block("Sort atom cells by id.", ({find, gather, record}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell");
        let {molecule, atom} = atom_cell;
        let ix = gather(atom_cell.atom.node.sort, atom_cell).per(molecule).sort();
        return [atom_cell.add("sort", ix)];
      })
      .block("Position atom cells in a spiral.", ({find, choose, lib:{math}, record}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell");
        let {molecule, atom} = atom_cell;
        let {x, y} = find("spiral", {row: 0, sort: atom_cell.sort});
        return [
          atom_cell.add({x, y}),
          // record("ui/text", {text: `x ${spiral.x} y ${spiral.y} | ix ${ix} | mag ${mag}`})
        ];
      })

      .block("When a molecule is hovered, display it's infobox.", ({find, record}) => {
        let molecule_cell = find("editor/molecule-list/molecule", {open: "true"});
        return [molecule_cell.add("children", [
          record("editor/molecule-list/molecule/infobox", {molecule_cell})
        ])];
      })

      .block("A molecule infobox is a column of field tables.", ({find, record}) => {
        let infobox = find("editor/molecule-list/molecule/infobox");
        return [infobox.add("tag", "ui/column")];
      })

      .block("A molecule infobox has a table per atom.", ({find, record}) => {
        let infobox = find("editor/molecule-list/molecule/infobox");
        let {molecule_cell} = infobox;
        let {molecule} = molecule_cell;
        let {atom} = molecule;
        let {node} = atom;
        return [infobox.add("children", [
          record("editor/molecule-list/molecule/infobox/node", {sort: node.sort, infobox, node}).add("atom", atom)
        ])];
      })

      .block("A node infobox has the node name, a plus field button.", ({find, record}) => {
        let node_infobox = find("editor/molecule-list/molecule/infobox/node");
        let {node} = node_infobox;
        return [
          node_infobox.add("tag", "ui/column").add("children", [
            record("editor/molecule-list/molecule/infobox/node/header", "ui/row", {sort: 1, node_infobox}).add("children", [
              record("editor/molecule-list/molecule/infobox/node/name", "ui/text", {sort: 1, node_infobox, text: node.name}),
            ]),
            record("ui/row", {sort: 3, node_infobox}).add("children", [
              record("editor/molecule-list/molecule/field/new", "ui/button", {sort: 1, node_infobox, icon: "android-add"}),
              record("editor/molecule-list/molecule/field/attribute", "ui/autocomplete", {sort: 2, node_infobox, placeholder: "field..."})
            ])
          ])
        ];
      })

      .block("A node infobox with multiple atoms shows a paginator in it's name row.", ({find, gather, record}) => {
        let node_infobox = find("editor/molecule-list/molecule/infobox/node");
        let infobox_header = find("editor/molecule-list/molecule/infobox/node/header", {node_infobox});
        let {node, count} = node_infobox;
        count > 1;
        return [
          infobox_header.add("children", [
            record("ui/row", {sort: 2, node_infobox, class: "editor-molecule-list-paginator"}).add("children", [
              record("ui/button", {sort: 1, node_infobox, icon: "arrow-left-b"}),
              record("ui/text", {sort: 2, text: `(1/${count})`}),
              record("ui/button", {sort: 3, node_infobox, icon: "arrow-right-b"}),
            ])
          ])
        ];
      })

      .block("A node infobox's count is the number of atoms it has that match.", ({find, gather, record}) => {
        let node_infobox = find("editor/molecule-list/molecule/infobox/node");
        let {node, infobox} = node_infobox;
        let {molecule_cell} = infobox;
        let {molecule} = molecule_cell;
        let {atom} = molecule;
        atom.node == node;
        let count = gather(atom).per(node).count();
        return [node_infobox.add("count", count)];
      })

      .block("A molecule infobox atom's fields are derived from its record AVs.", ({find, lookup, not, record}) => {
        let node_infobox = find("editor/molecule-list/molecule/infobox/node");
        let {node, atom} = node_infobox;
        let {attribute, value} = lookup(atom.record);
        not(() => {
          let other_atom = find("editor/atom", {node});
          node_infobox.atom == other_atom;
          other_atom.sort > atom.sort;
        })
        attribute != "tag";
        not(() => value.tag);

        return [
          node_infobox.add("children", [
            record("editor/molecule-list/molecule/infobox/atom", "ui/field-table", {sort: 2, node_infobox, atom, record: atom.record}).add("field", [
              record({node_infobox, record: atom.record, attribute}).add("value", value)
            ])
          ])
        ];
      })

      .block("Fill infobox attribute completions.", ({find, record}) => {
        let new_attribute = find("editor/molecule-list/molecule/field/attribute");
        let {node_infobox} = new_attribute;
        let completion = find("editor/existing-node-attribute", {node: node_infobox.node});
        return [new_attribute.add("completion", completion)];
      })


    //--------------------------------------------------------------------
    // Molecule Interactions
    //--------------------------------------------------------------------

    this.editor
      .commit("When an element is entered, mark it hovered.", ({find, record}) => {
        let {element} = find("html/event/mouseenter");
        return [element.add("tag", "html/hovered")];
      })
      .commit("When an element is left, clear it's hovered.", ({find, record}) => {
        let {element} = find("html/event/mouseleave");
        return [element.remove("tag", "html/hovered")];
      })

      .commit("Clicking a molecule opens it.", ({find}) => {
        let molecule_cell = find("editor/molecule-list/molecule");
        find("html/event/click", {element: molecule_cell});
        return [molecule_cell.add("open", "true")];
      })
      .commit("Clicking outside an open molecule closes it.", ({find, not}) => {
        let molecule_cell = find("editor/molecule-list/molecule", {open: "true"});
        find("html/event/click");
        not(() => find("html/event/click", {element: molecule_cell}));
        return [molecule_cell.remove("open")];
      })

      .commit("Clicking an atom opens it.", ({find}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell");
        find("html/event/click", {element: atom_cell});
        return [atom_cell.add("open", "true")];
      })
      .commit("Clicking an atom closes any other open atoms.", ({find}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell");
        find("html/event/click", {element: atom_cell});
        let other = find("editor/molecule-list/molecule/cell", {open: "true"});
        other != atom_cell;
        return [other.remove("open")];
      })

      .commit("Close any open atoms of closed molecules.", ({find, not}) => {
        let atom_cell = find("editor/molecule-list/molecule/cell", {open: "true"});
        not(() => atom_cell.molecule_cell.open);
        return [atom_cell.remove("open")];
      })

      .commit("Clicking the infobox new field button focuses it's autocomplete.", ({find}) => {
        let add_field = find("editor/molecule-list/molecule/field/new");
        let {node_infobox} = add_field;
        let event = find("html/event/click", {element: add_field})
        let field_autocomplete = find("editor/node-tree/node/field/new", {node_infobox});
        return [field_autocomplete.add("tag", "html/trigger-focus")];
      })

      // .block("Clicking the infobox new field button saves it.", ({find, record}) => {
      //   let add_field = find("editor/molecule-list/molecule/field/new");
      //   let event = find("html/event/click", {element: add_field})
      //   let {node_infobox} = add_field;
      //   let field_autocomplete = find("editor/molecule-list/molecule/field/attribute", {node_infobox});
      //   field_autocomplete.value != "";
      //   return [
      //     record("editor/event/save-field", {node: node_infobox.node, attribute: field_autocomplete.value}),
      //     record("editor/event/clear-autocomplete", {autocomplete: field_autocomplete})
      //   ];
      // })
      .block("Selecting a completion in the new field autocomplete saves it.", ({find, not, record}) => {
        let field_autocomplete = find("editor/molecule-list/molecule/field/attribute");
        let {node_infobox, selected} = field_autocomplete;
        return [
          record("editor/event/save-field", {node: node_infobox.node, attribute: selected.text}),
          record("editor/event/clear-autocomplete", {autocomplete: field_autocomplete})
        ];
      })

  }
}

Watcher.register("editor2", EditorWatcher);
