export {Watcher, Program, appendAsEAVs, RawEAV, RawValue, RawMap, createId} from "./watchers/watcher";
export {parseDoc} from "./parser/parser";

export var watcherPath = "./build/src/watchers";
import * as watchers from "./watchers/index";
export {watchers};
