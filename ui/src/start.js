var root = React.createClass({
  render: function() {
    return JSML(["p", "hey!"]);
  }
});

function dispatch(event, arg, noRedraw) {
  switch(event) {
    case "load":
      break;
    default:
      console.error("Dispatch for unknown event: ", event, arg);
      break;
  }

  if(!noRedraw) {
    React.render(React.createElement(root), document.body);
  }
}

dispatch("load");
