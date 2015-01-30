import macros from './macros.sjs';

var data = require('./data.json');
foreach(ix, view of data["department heads"].view) {
  console.log(ix, view);
};
