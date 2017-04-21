import {Watcher} from "./watchers/watcher";

import system from "./watchers/system";
import html from "./watchers/html";
import svg from "./watchers/svg";
import canvas from "./watchers/canvas";
import ui from "./watchers/ui";
import compiler from "./watchers/compiler";
import shape from "./watchers/shape";
import editor from "./watchers/editor";
import tagBrowser from "./watchers/tag-browser";

Watcher.register("system", system);
Watcher.register("html", html);
Watcher.register("svg", svg);
Watcher.register("canvas", canvas);
Watcher.register("ui", ui);
Watcher.register("compiler", compiler);
Watcher.register("shape", shape);
Watcher.register("editor", editor);
Watcher.register("tag browser", tagBrowser);

export {Watcher, Program, appendAsEAVs, RawEAV, createId} from "./watchers/watcher";

export var watcherPath = "./build/src/watchers";
