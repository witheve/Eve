"use strict";
var providers = {};
function provide(name, klass) {
    providers[name] = klass;
}
exports.provide = provide;
function get(name) {
    return providers[name];
}
exports.get = get;
//# sourceMappingURL=index.js.map