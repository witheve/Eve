//--------------------------------------------------------------------
// Editor
//--------------------------------------------------------------------

import {Watcher, Program, RawMap, RawValue, RawEAV, forwardDiffs, appendAsEAVs} from "../watchers/watcher";
import {CompilerWatcher} from "../watchers/compiler";
import {v4 as uuid} from "node-uuid";

//--------------------------------------------------------------------
// Fixture constants
//--------------------------------------------------------------------

const EDITOR_ID = `|${uuid()}`;
const STYLE_ID = `|${uuid()}`;

const TAG_MARINA_ID = `|${uuid()}`;
const TAG_MARINARA_ID = `|${uuid()}`;
const BLOCK_PPL_W_BOATS_ID = `|${uuid()}`;
const BLOCK_BOAT_TYPES_ID = `|${uuid()}`;
const FRAME_PPL_W_BOATS_QUERY_ID = `|${uuid()}`;

//--------------------------------------------------------------------
// Watcher
//--------------------------------------------------------------------

class EditorWatcher extends Watcher {
  editor:Program;


  setup() {
    this.editor = this.createEditor();
    let {editor, program} = this;

    this.program
      .watch("Export all tags.", ({find, lib:{string}, not, record}) => {
        let rec = find();
        let {tag} = rec;
        not(() => string.index_of(tag, "editor/") == 0);
        return [
          record("client_tag", {"client_tag": tag})
        ];
      })
      .asDiffs(forwardDiffs(editor))

      .watch("Send the editor attributes on records matching the tag.", ({find, lookup, record}) => {
        let attributes_from_tag = find("editor/attributes-from-tag");
        let {query_tag} = attributes_from_tag;
        let rec = find({tag: query_tag});
        let {attribute} = lookup(rec);

        return [
          attributes_from_tag.add({tag: "editor/attributes-from-tag", query_tag, attribute})
        ];
      })
      .asDiffs(forwardDiffs(editor))

      .watch("Send the editor attributes on records matching the parent's children.", ({find, lookup, record}) => {
        let attributes_from_parent = find("editor/attributes-from-parent");
        let {parent_tag, parent_attribute} = attributes_from_parent;
        let parent = find({tag: parent_tag});
        let {attribute:par_attr, value:rec} = lookup(parent);
        parent_attribute == par_attr;
        let {attribute} = lookup(rec);

        return [
          attributes_from_parent.add({tag: "editor/attributes-from-parent", parent_tag, parent_attribute, attribute})
        ];
      })
      .asDiffs(forwardDiffs(editor))

      // @FIXME: Quick hack to get things running.
      .watch("Attributes with a | are ids.", ({find, lookup, lib:{string}, record}) => {
        let attributes_from_tag = find("editor/attributes-from-tag");
        let {query_tag} = attributes_from_tag;
        let rec = find({tag: query_tag});
        let {attribute, value} = lookup(rec);
        string.index_of(value, "|");
        return [
          attributes_from_tag.add("record_attribute", attribute)
        ];
      })
      .asDiffs(forwardDiffs(editor));

    this.initEditor();
    this.fixtureEditor();
  }

  createEditor() {
    let editor = new Program("Editor");
    editor.attach("ui");
    editor.attach("shape");

    let compiler = editor.attach("compiler") as CompilerWatcher;
    compiler.injectInto(this.program);
    compiler.registerWatcherFunction("send-to-editor", forwardDiffs(editor, "send-to-editor"));

    //--------------------------------------------------------------------
    // Root UI
    //--------------------------------------------------------------------

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
      });

    //--------------------------------------------------------------------
    // Navigation
    //--------------------------------------------------------------------

    editor
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

        let [name] = choose(
          () => block.name,
          () => "Untitled Block"
        );

        return [
          tag.add("children", [
            record("editor/nav/block", "ui/text", {editor: tag.editor, nav_tag: tag.nav_tag, block, text: name, sort: name})
          ])
        ];
      });

    //--------------------------------------------------------------------
    // Block Description
    //--------------------------------------------------------------------

    editor
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
      });

    //--------------------------------------------------------------------
    // Block Frames
    //--------------------------------------------------------------------

    editor
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
        return [
          frame_elem.add("class", "active")
        ];
      })

      .commit("Clicking a frame activates it", ({find}) => {
        let frame_elem = find("editor/block/frame");
        find("html/event/click", {element: frame_elem});
        let {frame, editor} = frame_elem;
        return [
          editor.remove("active_frame").add("active_frame", frame)
        ];
      })

      .block("Add a new frame button to the storyboard.", ({find, record}) => {
        let storyboard = find("editor/block/storyboard");
        let {editor} = storyboard;
        let {active_block} = editor;
        return [
          storyboard.add("children", [
            record("editor/new-frame", "editor/block/frame", "ui/column", {editor, sort: Infinity})
          ])
        ];
      })

      .commit("Clicking the new frame button opens it", ({find}) => {
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
            record("editor/new-frame/type", "ui/button", {editor, text: "Data", type: "data", class: "flat"}),
          ])
        ];
      })

      .commit("Clicking a new frame type adds a frame of that type and closes the new frame button.", ({find, gather, choose, record}) => {
        let new_frame_type = find("editor/new-frame/type");
        find("html/event/click", "html/direct-target", {element: new_frame_type});
        let {type, editor} = new_frame_type;
        let new_frame = find("editor/new-frame", {editor});

        let {active_block:block} = editor;
        let [ix] = choose(
          () => gather(block.storyboard).per(block).count() + 1,
          () => 1
        );

        return [
          new_frame.remove("open"),
          block.add("storyboard", [
            record("editor/frame", {block, type, sort: ix})
          ])
        ];
      });

    this.attachMoleculeGenerator(editor);
    this.attachQueryEditor(editor);
    this.attachDataEditor(editor);

    return editor;
  }


  attachMoleculeGenerator(editor:Program) {
    //--------------------------------------------------------------------
    // Molecule generation
    //--------------------------------------------------------------------

    editor.block("Create a set of molecules for the active block's queries.", ({find, record}) => {
      let editor = find("editor/root");
      let {active_block} = editor;
      let {storyboard:frame} = active_block;
      frame.type == "query";
      let {node} = frame;
      node.tag == "editor/root-node";

      return [
        active_block.add("molecule-watch", [
          record("editor/molecule/watch", "eve/compiler/block", {editor, frame, name: "Create molecules", type: "watch", watcher: "send-to-editor"}).add("constraint", [
            record("editor/atom/record", "eve/compiler/record", {node, record: record("editor/atom/entity", "eve/compiler/var", {node})}),
          ])
        ])
      ];
    })

    editor.block("Embed subnodes.", ({find, record}) => {
      let molecule_watch = find("editor/molecule/watch");
      let {editor, frame} = molecule_watch;
      let {node} = frame;
      let {parent_node, parent_attribute} = node;

      let parent_record = find("editor/atom/record", {node: parent_node});

      let record_var;
      return [
        record_var = record("editor/atom/entity", "eve/compiler/var", {node}),
        parent_record.add("attribute", record({tag: "eve/compiler/av", attribute: parent_attribute, value: record_var})),

        molecule_watch.add("constraint", [
          record("editor/atom/record", "eve/compiler/record", {node, record: record_var})
        ])
      ];
    })


    editor.block("Attach node query tags to their atom records.", ({find, record}) => {
      let atom_record = find("editor/atom/record");
      let {node} = atom_record;
      let {query_tag} = node;

      return [
        atom_record.add("attribute", record({tag: "eve/compiler/av", attribute: "tag", value: query_tag})),
      ];
    })

    editor.block("Attach node fields to their atom records.", ({find, record}) => {
      let atom_record = find("editor/atom/record");
      let {node} = atom_record;
      let {query_field} = node;

      return [
        atom_record.add("attribute", [
          record({
            tag: "eve/compiler/av",
            attribute: query_field,
            value: record("editor/atom/field", "eve/compiler/var", {node, query_field})
          })
        ])
      ];
    })

    editor.block("Output a molecule for each root node.", ({find, record}) => {
      let molecule_watch = find("editor/molecule/watch");
      let {editor, frame} = molecule_watch;
      let node = find("editor/root-node");
      frame.node == node;

      let entity_var = find("editor/atom/entity", {node});

      let molecule_var;
      return [
        molecule_var = record("editor/molecule/output_var", "eve/compiler/var", {frame, node}),
        molecule_watch.add("constraint", [
          record("editor/molecule/output", "eve/compiler/output", {molecule_watch, node, record: molecule_var}).add("attribute", [
            record("eve/compiler/av", {attribute: "tag", value: "editor/molecule"}),
            record("eve/compiler/av", {attribute: "editor", value: editor}),
            record("eve/compiler/av", {attribute: "frame", value: frame}),
            record("eve/compiler/av", {attribute: "node", value: node}),
            record("eve/compiler/av", {attribute: "root_atom_record", value: entity_var}),
          ])
        ]),
      ];
    });

    editor.block("Attach the root atom to molecules.", ({find, record}) => {
      let molecule_output = find("editor/molecule/output");
      let {molecule_watch} = molecule_output;
      let {node} = molecule_output;

      let atom_var;
      return [
        atom_var = record("editor/atom/output_var", "eve/compiler/var", {node}),
        molecule_watch.add("constraint", [
          record("editor/atom/output", "eve/compiler/output", {node, molecule_output, record: atom_var})
        ]),
        molecule_output.add("parent_node", node),

      ];
    });

    editor.block("Attach subnode atoms to molecules.", ({find, record}) => {
      let molecule_output = find("editor/molecule/output");
      let {molecule_watch, parent_node} = molecule_output;
      let node = find("editor/query-node");
      node.parent_node == parent_node;

      let atom_var;
      return [
        atom_var = record("editor/atom/output_var", "eve/compiler/var", {node}),
        molecule_watch.add("constraint", [
          record("editor/atom/output", "eve/compiler/output", {node, molecule_output, record: atom_var})
        ]),
        molecule_output.add("parent_node", node),
      ];
    });

    editor.block("Fill vital atom output attributes and attach them to their molecule output.", ({find, record}) => {
      let atom_output = find("editor/atom/output");
      let {molecule_output, node} = atom_output;
      let entity_var = find("editor/atom/entity", {node});
      return [
        atom_output.add("attribute", [
          record("eve/compiler/av", {attribute: "tag", value: "editor/atom"}),
          record("eve/compiler/av", {attribute: "node", value: node}),
          record("eve/compiler/av", {attribute: "molecule", value: molecule_output.record}),
          record("eve/compiler/av", {attribute: "record", value: entity_var}),
        ]),

        molecule_output.add("attribute", [
          record("eve/compiler/av", "eve/compiler/attribute/non-identity", {attribute: "atom", value: atom_output.record}),
        ]),
      ];
    })

    // @FIXME: What about root node identity?
    editor.block("Attach node query fields to their atom outputs.", ({find, record}) => {
      let atom_field_var = find("editor/atom/field");
      let {node, query_field} = atom_field_var;
      let atom_output = find("editor/atom/output", {node});
      let {molecule_output} = atom_output;
      let {molecule_watch} = molecule_output;

      let field_var;
      return [
        field_var = record("editor/atom/field/output_var", "eve/compiler/var", {node, root_node: molecule_output.node}),
        molecule_watch.add("constraint", [
          record("editor/atom/field/output", "eve/compiler/output", {node, record: field_var}).add("attribute", [
            record("eve/compiler/av", {attribute: query_field, value: atom_field_var})
          ])
        ]),
        atom_output.add("attribute", [
          record("eve/compiler/av", "eve/compiler/attribute/non-identity", {attribute: "field", value: field_var}),
        ])
      ];
    })

    //--------------------------------------------------------------------
    // Molecule placement
    //--------------------------------------------------------------------

    editor
      .commit("Molecules start with a seed of 1", ({find, not}) => {
        let molecule = find("editor/molecule");
        not(() => molecule.seed);
        return [molecule.add("seed", 1)];
      })
      .block("Find a potential location for new molecules", ({find, lib:{random, math}, record}) => {
        let molecule = find("editor/molecule");
        let {seed, atom} = molecule;

        let x = math.round(random.number(`${molecule} ${seed} x`) * 10);
        let y = math.round(random.number(`${molecule} ${seed} y`) * 5);

        return [
          molecule.add({x, y}) // , positioned: "true"
        ];
      })
      .commit("A molecule with positioned false and a low enough seed should try to reposition.", ({find, record}) => {
        let molecule = find("editor/molecule", {positioned: "false"});
        molecule.seed < 4;
        return [
          molecule.remove("positioned").remove("seed").add("seed", molecule.seed + 1),
        ];
      })

      .block("Determine the suitability of a potential molecule position by colliding it's footprint with existing cells.", ({find, choose, not}) => {
        let molecule = find("editor/molecule");
        molecule.seed < 4;
        let delay = find("someone-is-maybe-positioned");
        //not(() => molecule.positioned);
        let [positioned] = choose(
          () => {
            let {skirt} = molecule;
            let other = find("editor/molecule");
            other.seed < 4;
            molecule.frame == other.frame;
            molecule.generation >= other.generation;
            molecule != other;
            let {atom:other_atom} = other;
            other_atom.x == skirt.x;
            other_atom.y == skirt.y;
            return "false";
          },
          () => {
            return "true";
          }
        );
        return [
          molecule.add("positioned", positioned)
        ];
      })

      .block("create a skirt around unpositioned molecules.", ({find, not, lib:{math}, record}) => {
        let molecule = find("editor/molecule");
        //not(() => molecule.positioned == "true");
        let {atom} = molecule;
        let {ix} = find("range");
        let {x, y} = find("spiral", {row: math.mod(atom.y, 2), ix});
        return [molecule.add("skirt", [
          record("editor/molecule/skirt", {x: atom.x + x, y: atom.y + y})
        ])];
      })

      .block("Sort atoms by id.", ({find, gather, record}) => {
        let molecule = find("editor/molecule");
        let {atom} = molecule;
        let ix = gather(atom).per(molecule).sort();
        return [
          atom.add("sort", ix)
        ];
      })

      .commit("When we first see a molecule, mark its generation.", ({find, not, choose, gather}) => {
        let molecule = find("editor/molecule");
        not(() => molecule.generation);
        let [generation] = choose(
          () => {
            let existing = find("editor/molecule");
            existing.generation;
            return gather(existing).count();
          },
          () => 1
        );

        return [molecule.add("generation", generation)];
      })

      .block("DEBUG: Sort molecules by id.", ({find, gather, record}) => {
        let molecule = find("editor/molecule");
        let ix = gather(molecule.frame, molecule.generation, molecule).sort();
        return [
          molecule.add("sort", ix)
        ];
      })

      .block("Compute atom positions from their sort.", ({find, lib:{math}, record}) => {
        let molecule = find("editor/molecule");
        let {atom, x:mol_x, y:mol_y} = molecule;
        let {x, y} = find("spiral", {row: math.mod(molecule.y, 2), ix: atom.sort});
        return [
          atom.add({x: mol_x + x, y: mol_y + y}),
          record("someone-is-maybe-positioned")
        ];
      })

    //--------------------------------------------------------------------
    // Molecule Interaction
    //--------------------------------------------------------------------

    editor
      .commit("Clicking on an atom cell opens it's molecule.", ({find, not}) => {
        let atom_cell = find("editor/atom/cell");
        find("html/event/click", {element: atom_cell});
        let {molecule} = atom_cell;
        not(() => molecule.open == "true");
        return [
          molecule.add("open", "true")
        ];
      })

      .commit("Clicking on an atom cell closes any currently open molecules.", ({find, not}) => {
        let atom_cell = find("editor/atom/cell");
        find("html/event/click", {element: atom_cell});
        let {molecule} = atom_cell;
        let {editor} = molecule;
        let other_molecule = find("editor/molecule", {editor, open: "true"});

        return [
          other_molecule.remove("open")
        ];
      })
  }

    attachQueryEditor(editor:Program) {
      editor.block("When the active frame is a query, inject the query editor UI.", ({find, union, record}) => {
        let content = find("editor/block/content");
        let {editor} = content;
        editor.active_frame.type == "query";

        return [
          content.add("children", [
            record("editor/block/query-tree", "ui/column", {editor}),
            record("editor/block/query-canvas", {editor})
          ])
        ];
      });

      //--------------------------------------------------------------------
      // Block Query Tree
      //--------------------------------------------------------------------

      editor
        .block("Compute the label and color of query nodes.", ({find, choose, lib:{string}}) => {
          let node = find("editor/query-node");
          let {name, sort} = node;
          let label = string.uppercase(string.get(name, 1));
          let [color] = choose(() => find("node-color", {ix: sort}).color, () => "gray");
          return [node.add({label, color})];
        })

        .block("Populate the block query for the active block.", ({find, union, record}) => {
          let query_elem = find("editor/block/query-tree");
          let {editor} = query_elem;
          let {active_frame} = editor;
          active_frame.type == "query";
          let {node} = active_frame;

          let [main_pattern] = union(
            () => node.query_tag,
            () => node.parent_attribute
          );

          return [
            record("editor/query/node", "ui/row", {editor, sort: node.sort, node, frame: active_frame}).add("children", [
              record("editor/query/hex", "shape/hexagon", {side: 21, lineWidth: 2, strokeStyle: "#AAA", fillStyle: "white", sort: 0, frame: active_frame, node}).add("content", [
                record("ui/text", {text: node.label, style: record({color: node.color})})
              ]),
              record("editor/query/pattern", "ui/column", {sort: 1, frame: active_frame, node}).add("children", [
                record("editor/query/pattern/main", "ui/row", {sort: 0, node}).add("children", [
                  record("ui/text", {sort: 1, text: main_pattern, class: "editor-query-tag"}),
                  record("ui/spacer", {sort: 2})
                ])
              ])
            ])
          ];
        })

        .block("Query root nodes are children of the query.", ({find, union, record}) => {
          let query_elem = find("editor/block/query-tree");
          let root_node = find("editor/query/node", {editor: query_elem.editor, node: find("editor/root-node")});
          return [
            query_elem.add("children", root_node)
          ];
        })

        .block("Non-root nodes are children of their parent node.", ({find, union, record}) => {
          let query_elem = find("editor/block/query-tree");
          let subnode = find("editor/query/node", {editor: query_elem.editor});
          let {node} = subnode;
          let {parent_node} = node;
          let parent_pattern = find("editor/query/pattern", {node: parent_node});
          return [
            parent_pattern.add("children", [
              record("ui/column", {node, sort: 4, class: "editor-query-subnode"}).add("children", subnode)
            ])
          ];
        })

        .block("Query nodes with attributes display them as a tree in the pattern.", ({find, record}) => {
          let query_pattern = find("editor/query/pattern");
          let {node} = query_pattern;
          let {query_field} = node;
          return [
            query_pattern.add("children", [
              record("ui/column", {node,  sort: 2}).add("children", [
                record("editor/query/field", "ui/row", {node, query_field, sort: query_field}).add("children", [
                  record("ui/text", {sort: 1, text: query_field}),
                  record("ui/spacer", {sort: 2})
                ])
              ])
            ])
          ];
        })

        .block("When a query node is open, display delete node button.", ({find, record}) => {
          let query_node = find("editor/query/node", {open: "true"});
          let {node} = query_node;
          let main = find("editor/query/pattern/main", {node});
          return [main.add("children", record("editor/query/delete-node", "ui/button", {sort: 9, node, icon: "close-round"}))];
        })
        .commit("Clicking a delete node button removes it from the block", ({find, record}) => {
          let delete_node = find("editor/query/delete-node");
          let click = find("html/event/click", {element: delete_node});
          let {node} = delete_node;
          let frame = find("editor/frame", {node});
          return [
            node.remove(),
            frame.remove("node", node)
          ];
        })



        .block("When a query node is open, display delete field buttons.", ({find, record}) => {
          let query_node = find("editor/query/node", {open: "true"});
          let {node} = query_node;
          let field = find("editor/query/field", {node});
          let {query_field} = field;
          return [field.add("children", record("editor/query/delete-field", "ui/button", {sort: 9, node, query_field, icon: "close-round"}))];
        })
        .commit("Clicking a delete field button removes its attribute from the pattern", ({find, record}) => {
          let delete_field = find("editor/query/delete-field");
          let click = find("html/event/click", {element: delete_field});
          let {node, query_field} = delete_field;
          return [
            node.remove("query_field", query_field)
          ];
        })

        .commit("Clicking a query hex opens the add attribute menu", ({find, not}) => {
          let query_hex = find("editor/query/hex");
          let click = find("html/event/click", {element: query_hex});
          let {node} = query_hex;
          let query_node = find("editor/query/node", {node});
          not(() => query_node.open);
          return [
            query_node.add("open", "true")
          ];
        })
        .commit("Clicking an open query hex closes it", ({find}) => {
          let query_hex = find("editor/query/hex");
          let click = find("html/event/click", {element: query_hex});
          let {node} = query_hex;
          let query_node = find("editor/query/node", {node, open: "true"});
          return [
            query_node.remove("open")
          ];
        })


        .watch("If a query node is adding an attribute, request attributes matching its tag from the client.", ({find, record}) => {
          let query_node = find("editor/query/node", {open: "true"});
          let {node} = query_node;
          return [record("editor/attributes-from-tag", {query_tag: node.query_tag})];
        })
        .asDiffs(forwardDiffs(this.program))

        .watch("If a query node is adding an attribute, request attributes matching its position in the hierarchy.", ({find, record}) => {
          let query_node = find("editor/query/node", {open: "true"});
          let {node} = query_node;
          return [record("editor/attributes-from-parent", {parent_tag: node.parent_node.query_tag, parent_attribute: node.parent_attribute})];
        })
        .asDiffs(forwardDiffs(this.program))


        .block("When a query node is in the new attribute state, show all the attributes matching its tag", ({find, choose, record}) => {
          let query_node = find("editor/query/node", {open: "true"});
          let {node} = query_node;
          let query_pattern = find("editor/query/pattern");
          query_node.children == query_pattern;
          let [attribute] = choose(
            () => {
              let {attribute} = find("editor/attributes-from-tag", {query_tag: node.query_tag});
              return [attribute];
            },
            () => {
              let {attribute} = find("editor/attributes-from-parent", {parent_tag: node.parent_node.query_tag, parent_attribute: node.parent_attribute});
              return [attribute];
            },
          );

          return [
            query_pattern.add("children", [
              record("ui/column", {node,  sort: 3}).add("children", [
                record("editor/query/node/new-attribute", "ui/text", {text: attribute, sort: attribute, attribute, node})
              ])
            ])
          ];
        })

        .commit("Clicking a new attribute in a query node adds it.", ({find, not, record}) => {
          let new_attribute = find("editor/query/node/new-attribute");
          let click = find("html/event/click", {element: new_attribute});
          let {node, attribute} = new_attribute;
          let query_node = find("editor/query/node", {node});
          not(() => find("editor/attributes-from-tag", {query_tag: node.query_tag, record_attribute: attribute}))
          return [
            node.add("query_field", attribute),
            query_node.remove("open")
          ];
        })

      // @FIXME: Getting multiple subnodes if we have existing attrs but not vice versa
        .commit("Clicking a new record attribute in a query node adds it as a sub-node.", ({find, gather, choose, record}) => {
          let new_attribute = find("editor/query/node/new-attribute");
          let click = find("html/event/click", {element: new_attribute});
          let {node, attribute} = new_attribute;
          let query_node = find("editor/query/node", {node});

          find("editor/attributes-from-tag", {query_tag: node.query_tag, record_attribute: attribute});

          let frame = query_node.frame;
          let [ix] = choose(() => {
            return [gather(frame.node).count() + 1];
          }, () => 1);

          return [
            node.add("query_subnode", attribute),
            query_node.frame.add("node", [
              record("editor/query-node", "editor/subnode", {
                type: "join",
                sort: ix,
                name: attribute,
                parent_attribute: attribute,
                parent_node: node,
              })
            ]),
            query_node.remove("open")
          ];
        })

        .block("The query always has a new node button", ({find, record}) => {
          let query_elem = find("editor/block/query-tree");
          let {editor} = query_elem;
          let {active_frame} = editor;

          return [
            query_elem.add("children", [
              record("ui/row", "editor/query/new-node", {sort: 9999, frame: active_frame}).add("children", [
                record("shape/hexagon", {side: 21, lineWidth: 2, strokeStyle: "#AAA", fillStyle: "white", class: "editor-query-hex"}).add("content", [
                  record("ui/text", {text: "+", style: record({color: "#AAA", "font-weight": 500})})
                ]),
              ])
            ])
          ];
        })

        .commit("Clicking on the new node button opens it.", ({find, not, record}) => {
          let new_node_button = find("editor/query/new-node");
          not(() => new_node_button.open == "true");
          let click = find("html/event/click", {element: new_node_button});
          return [
            new_node_button.add("open", "true")
          ];
        })

        .block("When the new node button is open, display a list of the clients tags.", ({find, record}) => {
          let new_node_button = find("editor/query/new-node", {open: "true"});
          let tag = find("client_tag").client_tag;
          return [
            new_node_button.add("children", [
              record("ui/column", {sort: 1}).add("children", [
                record("ui/text", "editor/query/new-node/tag", {text: tag, sort: tag, client_tag: tag, new_node_button})
              ])
            ])
          ];
        })

        .commit("Clicking on a new node tag adds it as a node to the query.", ({find, gather, choose, record}) => {
          let new_node_tag = find("editor/query/new-node/tag");
          let {new_node_button} = new_node_tag;
          let {client_tag} = new_node_tag;
          let {frame} = new_node_button;
          let click = find("html/event/click", {element: new_node_tag});

          // @FIXME: dependents of aggregates are busted due to stratification (?).
          // If we try to use ix directly for scanning we get no result.
          // If we try to use it after an expression for scanning we get no filtering at all.
          // Luckily in this case we needed it in a choose, which seems to stratify correctly.

          // @FIXME: Aggregates in chooses don't filter adequately without context.
          // We work around it for now by providing enough context in the choose branch for the aggregate to use.

          let [ix] = choose(() => {
            return [gather(frame.node).count() + 1];
          }, () => 1);

          return [
            new_node_button.remove("open"),
            frame.add("node", [
              record("editor/query-node", "editor/root-node", {
                type: "join",
                sort: ix,
                name: client_tag,
                query_tag: client_tag,
              })
            ])
          ];
        });

      //--------------------------------------------------------------------
      // Block Query Canvas
      //--------------------------------------------------------------------

      editor
        .block("Draw molecules as hex grids of atoms.", ({find, record}) => {
          let canvas_elem = find("editor/block/query-canvas");
          let {editor} = canvas_elem;
          let {active_frame} = editor;
          active_frame.type == "query";
          let molecule = find("editor/molecule", {editor, frame: active_frame, positioned: "true"});
          let {atom} = molecule;

          let side = 30;
          let gap = 3;

          return [
            canvas_elem.add({tag: "shape/hex-grid", side, gap}),
            canvas_elem.add("cell", [
              record("shape/hexagon", "editor/atom/cell", {atom, molecule, side, x: atom.x, y: atom.y, fillStyle: "white", lineWidth: 2, strokeStyle: "#ccc"}).add("content", [
                record("ui/text", {atom, molecule, text: `${atom.node.label} ${molecule.sort}`, style: record({color: atom.node.color})})
              ])
            ])
          ];
        })

        .block("Show molecule infobox when open.", ({find, lookup, record}) => {
          let molecule = find("editor/molecule", {open: "true"});
          let {atom, editor} = molecule;
          molecule.frame == editor.active_frame;
          let canvas_elem = find("editor/block/query-canvas", {editor});
          let {field} = atom;
          let {attribute, value} = lookup(field);
          return [
            canvas_elem.add("children", [
              record("ui/column", "editor/molecule/infobox", {sort: molecule.sort, molecule}).add("children", [
                record("ui/text", {text: `Molecule ${molecule.sort}`}),
                record("ui/row", {sort: atom.sort, molecule, atom}).add("children", [
                  record("ui/text", {sort: 0, text: `${atom.node.name} {`}),
                  record("ui/text", {sort: atom.sort, text: ` ${attribute}: ${value} `}),
                  record("ui/text", {sort: Infinity, text: `}`}),
                ])
              ])
            ])
          ];
        });
    }

  attachDataEditor(editor:Program) {
    editor.block("When the active frame is a data editor, inject the data editor UI.", ({find, union, record}) => {
      let content = find("editor/block/content");
      let {editor} = content;
      editor.active_frame.type == "data";

      return [
        content.add("children", [
          // record("editor/block/data-tree", "ui/column", {editor}),
          record("editor/block/data-canvas", "ui/column", {editor})
        ])
      ];
    });

    //--------------------------------------------------------------------
    // Data toolbar
    //--------------------------------------------------------------------
    editor
      .block("Draw the data editor toolbar.", ({find, record}) => {
        let canvas = find("editor/block/data-canvas");
        let {editor} = canvas;
        return [
          canvas.add("children", [
            record("editor/data/toolbar", "ui/column", {sort: 0}).add("children", [
              record("editor/data/toolbar/select", "editor/tool", "ui/button", {editor, icon: "arrow-up-c", text: "select", tool: "select", class: "flat"}),
              record("editor/data/toolbar/add", "editor/tool", "ui/button", {editor, icon: "plus", text: "add", tool: "add", class: "flat"}),
              record("editor/data/toolbar/remove", "editor/tool", "ui/button", {editor, icon: "minus", text: "erase", tool: "erase", class: "flat"}),
              record("editor/data/toolbar/save", "editor/tool", "ui/button", {editor, icon: "play", text: "save", tool: "save", class: "flat"}),
            ])
          ])
        ];
      })

      .commit("Clicking a tool activates it.", ({find, record}) => {
        let tool = find("editor/tool");
        find("html/event/click", {element: tool});
        return [
          tool.add("tag", "editor/active")
        ];
      })

      .commit("Clicking with a tool disables it.", ({find, record}) => {
        let editor = find("editor/root");
        let tool = find("editor/tool", "editor/active", {editor});
        find("html/event/click");
        return [
          tool.remove("tag", "editor/active")
        ];
      })
      .commit("The save tool automatically disables after saving.", ({find, record}) => {
        let editor = find("editor/root", {tool: "save"});
        let tool = find("editor/data/toolbar/save", "editor/active", {editor});
        return [
          tool.remove("tag", "editor/active")
        ];
      })

      .block("The editor tool is the tool currently marked active.", ({find}) => {
        let {tool, editor} = find("editor/tool", "editor/active");
        return [editor.add("tool", tool)];
      })

    //--------------------------------------------------------------------
    // Data canvas
    //--------------------------------------------------------------------
    editor
      .block("Draw molecules as hex grids of atoms.", ({find, record}) => {
        let canvas_elem = find("editor/block/data-canvas");
        let {editor} = canvas_elem;
        let {active_block} = editor;
        let {storyboard:frame} = active_block;
        frame.type == "query";
        let molecule = find("editor/molecule", {editor, frame, positioned: "true"});
        let {atom} = molecule;

        let side = 30;
        let gap = 5;

        return [
          canvas_elem.add("children", [
            record("shape/hex-grid", {frame, side, gap}).add("cell", [
              record("shape/hexagon", "editor/atom/cell", {atom, molecule, side, x: atom.x, y: atom.y, fillStyle: "white", lineWidth: 2, strokeStyle: "#ccc"}).add("content", [
                record("ui/text", {atom, molecule, text: `${atom.node.label} ${molecule.sort}`, style: record({color: atom.node.color})})
              ])
            ])
          ])
        ];
      })

      .block("Data molecule infobox.", ({find, record}) => {
        let infobox = find("editor/data/molecule/infobox");
        let {editor, molecule} = infobox;
        let {atom} = molecule;
        let {node} = atom;
        return [
          infobox.add({tag: "ui/column", sort: molecule.sort, molecule}).add("children", [
            record("editor/data/node/infobox", {molecule, node})
          ])
        ];
      })
      .block("Data node infobox.", ({find, record}) => {
        let node_infobox = find("editor/data/node/infobox")
        let {molecule, node} = node_infobox;
        let {atom} = molecule;
        atom.node == node;
        return [
          node_infobox.add({tag: "ui/column", sort: node.sort}).add("children", [
            record("editor/data/node/header", "ui/text", {sort: 0, molecule, node, text: node.name}),
            record("editor/data/atom/infobox", {molecule, atom})
          ])
        ];
      })
      .block("A node infobox that's adding always displays an empty field row.", ({find, record}) => {
        let node_infobox = find("editor/data/node/infobox", "editor/data/adding");
        let {molecule, node} = node_infobox;

        return [
          node_infobox.add("children", [
            record("editor/data/field/row", {sort: `zzzz`, molecule, node})
          ])
        ];
      })


      .block("Data atom infobox.", ({find, lookup, record}) => {
        let atom_infobox = find("editor/data/atom/infobox")
        let {molecule, atom} = atom_infobox;
        let {node, field} = atom;
        let {attribute, value} = lookup(field);
        return [
          atom_infobox.add({tag: "ui/column", sort: atom.sort, node}).add("children", [
            record("editor/data/field/row", {molecule, node, atom, attribute}).add({field, value})
          ])
        ];
      })

      .block("Data field row.", ({find, record}) => {
        let field_row = find("editor/data/field/row");
        let {molecule, node, attribute, value} = field_row;
        return [
          field_row.add({tag: "ui/row", sort: attribute}).add("children", [
            record("editor/data/field/attribute", "ui/text", {sort: 1, field_row, attribute, text: attribute}),
            record("editor/data/field/value-set", "ui/column", {sort: 2, field_row, attribute}).add("children", [
              record("editor/data/field/value", "ui/text", {sort: value, field_row, attribute, value, text: value})
            ])
          ])
        ];
      })

      .block("A data field row without an attribute is a new field row.", ({find, not, record}) => {
        let field_row = find("editor/data/field/row");
        not(() => field_row.attribute);
        let {molecule, node} = field_row;
        return [
          field_row.add({tag: ["editor/data/field/new-row", "ui/row"]}).add("children", [
            record("editor/data/field/attribute", "editor/data/field/new-attribute", "ui/input", {sort: 1, field_row, placeholder: "attribute..."}),
            record("editor/data/field/value-set", "ui/column", {sort: 2, field_row}).add("children", [
              record("editor/data/field/value", "editor/data/field/new-value", "ui/input", {field_row, text: "value..."})
            ])
          ])
        ];
      })

      .block("A field row that's adding always displays an empty value at the bottom of it's value set.", ({find, record}) => {
        let field_row = find("editor/data/field/row", "editor/data/adding");
        let value_set = field_row.children;
        value_set.tag == "editor/data/field/value-set";

        return [
          value_set.add("children", [
            record("editor/data/field/value", "editor/data/field/new-value", "ui/input", {sort: `zzzz`, field_row, placeholder: "value..."})
          ])
        ];
      })
      .block("new values dump into their field row's adding_value attribute.", ({find}) => {
        let new_value = find("editor/data/field/new-value");
        let {field_row, value} = new_value;
        return [field_row.add("adding_value", value)];
      })
      .block("new attributes dump into their field row's adding_attribute attribute.", ({find}) => {
        let new_attribute = find("editor/data/field/new-attribute");
        let {field_row, value} = new_attribute;
        return [field_row.add("adding_attribute", value)];
      })


      .block("Show molecule infobox when open.", ({find, lookup, record}) => {
        let molecule = find("editor/molecule", {open: "true"});
        let {editor} = molecule;
        let canvas_elem = find("editor/block/data-canvas", {editor});
        return [canvas_elem.add("children", record("editor/data/molecule/infobox", {editor, molecule}))];
      });

    //--------------------------------------------------------------------
    // Data editing
    //--------------------------------------------------------------------

    editor
      .block("Clicking an erased target with the add tool undoes the erase.", ({find, choose, record}) => {
        let removed = find("editor/data/erasing");
        find("html/event/click", {element: removed});
        let [editor] = choose(() => removed.editor, () => removed.molecule.editor, () => removed.field_row.molecule.editor);
        editor.tool == "add";
        return [
          record("editor/cancel-action", {editor, element: removed, cancelled: "editor/data/erasing"})
        ];
      })
      .block("Clicking an added target with the erase tool undoes the add.", ({find, choose, record}) => {
        let added = find("editor/data/adding");
        find("html/event/click", {element: added});
        let [editor] = choose(() => added.editor, () => added.molecule.editor, () => added.field_row.molecule.editor);
        editor.tool == "erase";
        return [
          record("editor/cancel-action", {editor, element: added, cancelled: "editor/data/adding"})
        ];
      })
      .commit("If an add and erase cancelled, remove the cancelled tag on whatever element it happened on.", ({find}) => {
        let cancel = find("editor/cancel-action");
        let {element, cancelled} = cancel;
        return [element.remove("tag", cancelled)];
      })

      .commit("Clicking an infobox attribute with the erase tool marks its field for deletion.", ({find, not, record}) => {
        let target = find("editor/data/field/attribute");
        find("html/event/click", {element: target});
        let {field_row} = target;
        let {molecule} = field_row;
        molecule.editor.tool == "erase";
        not(() => find("editor/cancel-action", {editor: molecule.editor}));
        return [
          field_row.add("tag", "editor/data/erasing")
        ];
      })
      .commit("Clicking an infobox value with the erase tool marks it for deletion.", ({find, not, record}) => {
        let target = find("editor/data/field/value");
        find("html/event/click", {element: target});
        let {field_row} = target;
        let {molecule} = field_row;
        molecule.editor.tool == "erase";
        not(() => find("editor/cancel-action", {editor: molecule.editor}));
        return [
          target.add("tag", "editor/data/erasing")
        ];
      })

      .commit("Clicking an infobox value with the add tool marks the field row as adding.", ({find, not, choose, record}) => {
        let target = find("editor/data/field/value-set");
        let field_row = find("editor/data/field/row", {children: target});
        find("html/event/click", {element: target});

        let {molecule} = field_row;
        molecule.editor.tool == "add";
        not(() => find("editor/cancel-action", {editor: molecule.editor}));
        return [
          field_row.add("tag", "editor/data/adding")
        ];
      })

      .commit("Clicking an infobox attribute with the add tool marks its node as adding.", ({find, not, choose, record}) => {
        let target = find("editor/data/field/attribute");
        find("html/event/click", {element: target});

        let {molecule, node} = target.field_row;
        let node_infobox = find("editor/data/node/infobox", {node});

        molecule.editor.tool == "add";
        return [
          node_infobox.add("tag", "editor/data/adding")
        ];
      })

    //--------------------------------------------------------------------
    // Data save changes
    //--------------------------------------------------------------------
    editor
      .commit("When the editor's current tool is save, commit all pending value erases.", ({find, record}) => {
        let editor = find("editor/root", {tool: "save"});
        let erasing = find("editor/data/erasing", "editor/data/field/value");
        let {active_block} = editor;
        let {molecule, node, attribute, value} = erasing;
        molecule.editor == editor;
        return [
          active_block.add("data_output", record("editor/data/erase/value", {node, attribute, value})),
          erasing.remove("tag", "editor/data/erasing")
        ];
      })
      .commit("When the editor's current tool is save, commit all pending attribute erases.", ({find, record}) => {
        let editor = find("editor/root", {tool: "save"});
        let erasing = find("editor/data/erasing", "editor/data/field/attribute");
        let {active_block} = editor;
        let {molecule, node, attribute} = erasing;
        molecule.editor == editor;
        return [
          active_block.add("data_output", record("editor/data/erase/attribute", {node, attribute})),
          erasing.remove("tag", "editor/data/erasing")
        ];
      })
      .commit("When the editor's current tool is save, commit all pending value adds.", ({find, record}) => {
        let editor = find("editor/root", {tool: "save"});
        let {active_block} = editor;

        let adding = find("editor/data/adding", "editor/data/field/row");
        let {molecule, node, attribute, adding_value} = adding;
        molecule.editor == editor;
        return [
          active_block.add("data_output", record("editor/data/add/value", {node, attribute, value: adding_value})),
          adding.remove("tag", "editor/data/adding")
        ];
      })
      .commit("When the editor's current tool is save, commit all pending attribute adds.", ({find, record}) => {
        let editor = find("editor/root", {tool: "save"});
        let {active_block} = editor;

        let adding = find("editor/data/adding", "editor/data/node/infobox");
        let {molecule, node} = adding;
        molecule.editor == editor;

        let new_row = find("editor/data/field/row", {node});
        let {adding_attribute, adding_value} = new_row;

        return [
          active_block.add("data_output", record("editor/data/add/value", {node, attribute: adding_attribute, value: adding_value})),
          adding.remove("tag", "editor/data/adding")
        ];
      })

      .block("What are the data outputs?", ({find, lookup, record}) => {
        let editor = find("editor/root");
        let {active_block} = editor;
        let {data_output} = active_block;
        let {attribute, value} = lookup(data_output);

        return [
          record("ui/column", "debuggeroo", {active_block}).add("children", [
            record("ui/text", {sort: 0, text: active_block.name}),
            record("ui/row", {sort: data_output}).add("children", [
              record("ui/text", {sort: attribute, data_output, text: ` ${attribute}: ${value} `})
            ])
          ])
        ];
      })

    //--------------------------------------------------------------------
    // Data block generation
    //--------------------------------------------------------------------

    editor
      .block("When the editor's current tool is save, create a block representing the changes.", ({find, record}) => {
        let editor = find("editor/root");
        let {active_block} = editor;

        return [
          active_block.add("data_block", [
            record("editor/data/block", "eve/compiler/block", {editor, block: active_block, name: "Data block", type: "block"})
          ])
        ];
      })

      .commit("Clear the old block contents.", ({find}) => {
        let editor = find("editor/root", {tool: "save"});
        let {block} = editor;
        let {data_block} = block;
        let variable = find("editor/data/node/entity");
        return [
          data_block.constraint.remove(),
          data_block.constraint.attribute.remove(),
          variable.remove()
        ];
      })

      .commit("Mark the datablock to be rebuilt on save.", ({find}) => {
        let editor = find("editor/root", {tool: "save"});
        let {block} = editor;
        let {data_block} = block;
        return [data_block.add("rebuild", "true")];
      })

      .commit("Clear rebuild off the datablock.", ({find}) => {
        let editor = find("editor/root");
        let {block} = editor;
        let {data_block} = block;
        data_block.rebuild == "true";
        return [data_block.remove("rebuild", "true")]
      })

      .commit("Copy all the records from the molecule watch.", ({find, record}) => {
        let editor = find("editor/root");
        let {block} = editor;
        let {data_block} = block;
        data_block.rebuild;

        let atom_record = find("editor/atom/record");
        let {node, attribute:attr} = atom_record;

        let entity_var;
        return [
          entity_var = record("editor/data/node/entity", "eve/compiler/var", {node}),
          data_block.add("constraint", record("eve/compiler/record", {node, record: entity_var}).add("attribute", [
            record({attribute: attr.attribute, value: attr.value})
          ])),
        ];
      })

      .block("Add value outputs.", ({find, record}) => {
        let editor = find("editor/root");
        let {block} = editor;
        let {data_block, data_output} = block;
        // data_block.rebuild;

        data_output.tag == "editor/data/add/value";
        let {node, attribute, value} = data_output;
        let node_var = find("editor/data/node/entity", {node});
        return [
          data_block.add("constraint", [
            record("eve/compiler/output", {node, record: node_var}).add("attribute", [
              record({attribute, value})
            ])
          ])
        ];
      })

      .commit("Erase value outputs.", ({find, record}) => {
        let editor = find("editor/root");
        let {block} = editor;
        let {data_block, data_output} = block;
        data_block.rebuild;

        data_output.tag == "editor/data/erase/value";
        let {node, attribute, value} = data_output;
        let node_var = find("editor/data/node/entity", {node});
        return [
          data_block.add("constraint", [
            record("eve/compiler/remove", "eve/compiler/output", {node, record: node_var}).add("attribute", [
              record({attribute, value})
            ])
          ])
        ];
      })
  }

  initEditor() {
    //--------------------------------------------------------------------
    // Kick it off
    //--------------------------------------------------------------------
    let input:RawEAV[] = [
      [EDITOR_ID, "tag", "editor/root"],
      [STYLE_ID, "tag", "html/element"],
      [STYLE_ID, "tagname", "link"],
      [STYLE_ID, "rel", "stylesheet"],
      [STYLE_ID, "href", "assets/css/editor.css"],
    ];

    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 1, x: 0, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 2, x: 1, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 3, x: 1, y: 1});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 4, x: 0, y: 1});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 5, x: -1, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 6, x: 0, y: -1});
    appendAsEAVs(input, {tag: "spiral", row: 1, ix: 7, x: 1, y: -1});

    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 1, x: 0, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 2, x: 1, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 3, x: 0, y: 1});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 4, x: -1, y: 1});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 5, x: -1, y: 0});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 6, x: -1, y: -1});
    appendAsEAVs(input, {tag: "spiral", row: 0, ix: 7, x: 0, y: -1});

    appendAsEAVs(input, {tag: "range", ix: 0});
    appendAsEAVs(input, {tag: "range", ix: 1});
    appendAsEAVs(input, {tag: "range", ix: 2});
    appendAsEAVs(input, {tag: "range", ix: 3});
    appendAsEAVs(input, {tag: "range", ix: 4});
    appendAsEAVs(input, {tag: "range", ix: 5});
    appendAsEAVs(input, {tag: "range", ix: 6});
    appendAsEAVs(input, {tag: "range", ix: 7});
    appendAsEAVs(input, {tag: "range", ix: 8});
    appendAsEAVs(input, {tag: "range", ix: 9});
    appendAsEAVs(input, {tag: "range", ix: 10});

    // appendAsEAVs(input, {tag: "node-color", ix: 1, color: "red"});
    // appendAsEAVs(input, {tag: "node-color", ix: 2, color: "orange"});
    // appendAsEAVs(input, {tag: "node-color", ix: 3, color: "yellow"});
    // appendAsEAVs(input, {tag: "node-color", ix: 4, color: "green"});
    // appendAsEAVs(input, {tag: "node-color", ix: 5, color: "blue"});
    // appendAsEAVs(input, {tag: "node-color", ix: 6, color: "indigo"});
    // appendAsEAVs(input, {tag: "node-color", ix: 7, color: "violet"});
    // appendAsEAVs(input, {tag: "node-color", ix: 8, color: "light gray"});
    // appendAsEAVs(input, {tag: "node-color", ix: 9, color: "dark gray"});

    appendAsEAVs(input, {tag: "node-color", ix: 1, color: "#9926ea"});
    appendAsEAVs(input, {tag: "node-color", ix: 2, color: "#6c86ff"});
    appendAsEAVs(input, {tag: "node-color", ix: 3, color: "red"});
    appendAsEAVs(input, {tag: "node-color", ix: 4, color: "orange"});
    appendAsEAVs(input, {tag: "node-color", ix: 5, color: "green"});
    appendAsEAVs(input, {tag: "node-color", ix: 6, color: "indigo"});


    this.editor.inputEavs(input);
    console.log(this);
  }

  fixtureEditor() {
    /*
     * [#editor/root
     *  active_block // Block being edited
     *  active_frame // Current frame of the active_block
     *  block        // All blocks in program
     * ]
     *
     * [#editor/block
     *  name
     *  description
     *  nav_tag          // Navigation tags that relate to this block
     *  storyboard       // All frames of the block
     *  molecule_watch C // Watch block(s) producing molecules for the given block
     *  data_output      // All operations being applied to the current data
     *  data_block     C // Compiled blocks that run the data_output operations
     * ]
     *
     * [#editor/frame
     *  type // Editor type associated with this frame ("query", "data", etc.)
     *  sort // Order of this frame in the parent block's storyboard
     * ]
     * [#editor/frame type: "query"
     *  node // All nodes contributing to this query
     * ]
     *
     * [#editor/query-node
     *  type               // Join, expression, etc.
     *  sort               // Order of this node in the parent frame's node list
     *  name               // Human readable node name
     *  query_tag        ? // Matches records IFF they have the given tag
     *  query_field      ? // Matches records IFF they have the given attributes
     *  parent_node      ?
     *  parent_attribute ? // Matches records IFF they are in the value set of parent_attribute on a record matching parent_node
     *  label            C // Short label for the node
     *  color            C
     * ]
     *
     * [#editor/molecule // Macro compiled
     *  editor
     *  frame
     *  node             // The root node that defines the identity of the molecule
     *  root_atom_record // The entity ID of the record defining the identity of th molecule
     *  atom             // The set of atoms composing the molecule
     * ]
     *
     * [#editor/atom // Macro compiled
     *  node
     *  molecule
     *  record
     *  field: [ // AVs matching the query_field attributes for this atom's node
     *   <query_field>: value
     *  ]
     * ]
     *
     */


    let fixture:RawEAV[] = [
      [EDITOR_ID, "block", BLOCK_PPL_W_BOATS_ID],
      [EDITOR_ID, "block", BLOCK_BOAT_TYPES_ID],
      [EDITOR_ID, "active_block",  BLOCK_PPL_W_BOATS_ID],
      [EDITOR_ID, "active_frame",  FRAME_PPL_W_BOATS_QUERY_ID]
    ];

    appendAsEAVs(fixture, {name: "Marina"}, TAG_MARINA_ID);
    appendAsEAVs(fixture, {name: "Marinara"}, TAG_MARINARA_ID);

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
            //appendAsEAVs([], {tag: ["editor/query-node", "editor/root-node"], type: "join", sort: 1, name: "person", query_tag: "person", query_field: ["name", "age"]}),
          ]
        }, FRAME_PPL_W_BOATS_QUERY_ID),
        appendAsEAVs([], {
          tag: "editor/frame",
          type: "data",
          sort: 2,
        })
      ],
    }, BLOCK_PPL_W_BOATS_ID);

    appendAsEAVs(fixture, {
      tag: "editor/block",
      nav_tag: TAG_MARINA_ID,
      name: "Boat types",
      description: `It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of labels, as opposed to using 'Content here, content here', making it look like readable English.`
    }, BLOCK_BOAT_TYPES_ID);

    this.editor.inputEavs(fixture);
  }
}

Watcher.register("editor", EditorWatcher);
