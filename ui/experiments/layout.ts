module layoutz {
  declare var cytoscape;
  
  var testData = {
    nodes: [
      {data: {id: "foo"}},
      {data: {id: "bar"}},
      {data: {id: "baz"}},
      {data: {id: "blitzen"}},
      {data: {id: "pain stank"}},
      {data: {id: "redbert"}},
      {data: {id: "eggshoe"}},
      {data: {id: "filbert"}},
      {data: {id: "jim"}},
      {data: {id: "flagella"}}            
    ], 
    edges: [
      {data: {source: "foo", target: "bar"}},
      {data: {source: "blitzen", target: "pain stank"}},    
      {data: {source: "foo", target: "baz"}},    
      {data: {source: "baz", target: "bar"}},    
      {data: {source: "redbert", target: "blitzen"}},    
      {data: {source: "eggshoe", target: "filbert"}},    
      {data: {source: "blitzen", target: "foo"}},    
      {data: {source: "baz", target: "redbert"}},    
      {data: {source: "jim", target: "flagella"}}
    ]
  };
  
  var seed = 1;
  
  // courtesy of <http://stackoverflow.com/a/19303725>
  function srand() {
      var x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
  }
  
  var genData = {nodes: [], edges: []};
  for(var ix = 0; ix < 50; ix++) {
    genData.nodes[ix] = {data: {id: ""+ix}, style: {content: "foo", "background-color": "red"}};
  }
  var usedEdges = {};
  for(var ix = 0; ix < 50; ix++) {
    let src = Math.floor(srand() * genData.nodes.length);
    let dest = Math.floor(srand() * genData.nodes.length);
    if(src === dest || (usedEdges[src] && usedEdges[src].indexOf(dest) !== -1)) {
      ix--;
      continue;
    }
    if(!usedEdges[src]) { usedEdges[src] = []; }
    usedEdges[src].push(dest);
    genData.edges[ix] = {data: {source: src, target: dest}};
  }
  
  var cy = cytoscape({
    container: document.querySelector("#container"),
    elements: genData,
    layout: {name: "concentric", avoidOverlap: true, stop: function() {
      cy.layout({
        name: "cola",
        refresh: 4,
        flow: {axis: "x", minSeparation: 10},
        maxSimulationTime: 2000
        
      });
    }},
    renderer: "canvas"
  });
  window["cy"] = cy;
}