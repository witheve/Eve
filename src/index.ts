export {Watcher, Program, appendAsEAVs, RawEAV, createId} from "./watchers/watcher";

// allow bundlers (e.g. webpack) to find common watcher modules
import './watchers/system';
import './watchers/html';
import './watchers/svg';
import './watchers/canvas';
import './watchers/ui';

export var watcherPath = "./build/src/watchers";
