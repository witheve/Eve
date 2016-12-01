
export function get(file) {
  if(global["browser"]) {
    return global["examples"][file];
  } else {
    return global["fileFetcher"](file);
  }
}
