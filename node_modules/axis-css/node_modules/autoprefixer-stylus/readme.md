Autoprefixer Stylus
-------------------

An [autoprefixer](https://github.com/ai/autoprefixer) plugin for stylus.

[![tests](https://travis-ci.org/jenius/autoprefixer-stylus.png?branch=master)](https://travis-ci.org/jenius/autoprefixer-stylus)
[![npm](https://badge.fury.io/js/autoprefixer-stylus.png)](http://badge.fury.io/js/autoprefixer-stylus)

### Installation

You can install through npm as such: `npm install autoprefixer-stylus`

### Usage

You can include autoprefixer-stylus as a normal stylus plugin. Basic example below:

```js
var stylus = require('stylus');
var autoprefixer = require('autoprefixer-stylus');

stylus(css)
  .use(autoprefixer())
  .render(function(err, output){
    console.log(output);
  });
```

You can also target specific browsers if you want as such:

```js
stylus(css)
  .use(autoprefixer('ie 7', 'ie 8'))
```

If you'd like to install globally and run from the command line, you can do it like this:

```js
npm install -g autoprefixer-stylus
stylus -u autoprefixer-stylus -c example.styl
```

License (MIT)
-------------

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
