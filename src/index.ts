export {SystemWatcher} from "./watchers/system";
export {HTMLWatcher} from "./watchers/html";
export {SVGWatcher} from "./watchers/svg";
export {CanvasWatcher} from "./watchers/canvas";
export {UIWatcher} from "./watchers/ui";
export {CompilerWatcher} from "./watchers/compiler";
export {ShapeWatcher} from "./watchers/shape";
export {EditorWatcher} from "./watchers/editor";
export {TagBrowserWatcher} from "./watchers/tag-browser";

export {Watcher, Program, appendAsEAVs, RawEAV, createId} from "./watchers/watcher";

export var watcherPath = "./build/src/watchers";
