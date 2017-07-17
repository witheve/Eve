export {Watcher, Program, appendAsEAVs, RawEAV, RawEAVC, RawValue, RawMap, RawRecord, createId, EAVDiffs, Diffs} from "./watchers/watcher";
export {parseDoc} from "./parser/parser";

export var watcherPath = "./build/src/watchers";
import * as watchers from "./watchers/index";
export {watchers};
