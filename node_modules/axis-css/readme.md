Axis CSS
---------

[![NPM version](https://badge.fury.io/js/axis-css.png)](http://badge.fury.io/js/axis-css)
[![Dependency Status](https://david-dm.org/jenius/axis.png)](https://david-dm.org/jenius/axis)

Axis is a terse, feature-rich css library built on top of stylus. It's a child of the [roots build system](http://github.com/jenius/roots), but is totally old enough to live on it's own. It can be integrated as a plugin for stylus or included manually.

**Detailed documentation for axis [can be found here!](http://roots.cx/axis)**

## Usage

Axis is already integrated into [roots](http://roots.cx) by default, and it's super easy to use it there. Definitely the easiest way if you are setting up a project that uses stylus anyway, and it comes with jade and coffeescript ready out of the box as well. However, if you do want to include manually in your own pipeline, here's how to make it happen with connect (or express):

```js
var connect = require('connect')
  , stylus = require('stylus')
  , axis = require('axis-css');

var server = connect();

function compile(str, path) {
  return stylus(str)
    .set('filename', path)
    .use(axis());
}

server.use(stylus.middleware({
    src: __dirname
  , compile: compile
}));
```

By default, axis' mixins will be included automatically into all parsed stylesheets when included as above. If you'd like to import axis manually in stylus when you want to use it, you can pass `{ implicit: false }` to the axis call, as such:

```js
function compile(str, path) {
  return stylus(str)
    .set('filename', path)
    .use(axis({implicit: false}));
}
```

If you do it this way, you'll need to `@import` axis manually wherever you'd like access to the mixins, as such:

```styl
@import 'axis'

normalize()
base()
...etc...
```

## License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
