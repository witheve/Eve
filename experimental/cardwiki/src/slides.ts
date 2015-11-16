module slides {

  var eve = app.eve;
  var newSearch = wiki.newSearch;
  var newSearchResults = wiki.newSearchResults;

  function randomlyLetter(phrase, klass = "") {
    let children = [];
    let ix = 0;
    for(var letter of phrase) {
      let rand = Math.round(Math.random() * 5);
      children.push({id: phrase + ix, t: "span", c: `letter`, text: letter, enter: {opacity: 1, duration: (rand * 100) + 150, delay: (0 * 30) + 300}, leave: {opacity: 0, duration: 250}});
      ix++;
    }
    return {c: `phrase ${klass}`, children};
  }

    var slideNumber = 0;
  var slides = [
    {type: "slide",
     content: {children: [
       randomlyLetter("The world is full of bits of information.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("We spend our lives exploring those bits.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("They form the foundation of our understanding, our decisions, our work...")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And yet the tools we have to work with them are fairly primitive.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Our communications are static"),
         randomlyLetter("- Information requires rigid structure"),
         randomlyLetter("- Exploration is either limited or it's code"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("That's where I come in.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I help collect, explore, and communicate aspects of the world around you.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("My name is Eve.")
     ]}},
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "vin diesel", top: 0, left: 0});
       diff.add("search query", {id: "vin diesel", search: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = newSearch("vin diesel");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "vin diesel"});
       diff.remove("search query", {id: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = null;
     },
     content: () => {
       let search:any = newSearchResults("vin diesel");
       search.leave = {opacity:0, duration: 300},
       search.enter = {opacity:1, duration: 2500, delay: 300, begin: (node) => {
         if(!node[0]) return;
         setTimeout(() => {
           node[0].querySelector(".search-box").editor.refresh();
         }, 30);
       }};
       return {children: [
         randomlyLetter("And I collect bits like this one"),
         search,
         //        {c: "bit entity", text: "George Washington"}
       ]}}
    },
    {type: "slide",
     content: {children: [
       randomlyLetter("A bit is kind of like a page in a wiki.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- You can capture information however it comes."),
         randomlyLetter("- No planning or pre-structuring is required"),
         randomlyLetter("- Nothing is too big or too small for a bit"),
         randomlyLetter("- Instead of just rows in tables, you can collect the whole story"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("All of which is important when importing information from the outside world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And I was designed to be as malleable as possible to accomodate that.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- You can add structure at any time"),
         randomlyLetter("- Work with heterogenous collections"),
         randomlyLetter("- Handle one off tasks and deal with special cases"),
       ]}
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("But that malleability doesn't sacrafice the ability to explore.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can navigate through the web of bits you collect and ask complex questions to discover new information.")
     ]}},
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "vin diesel", top: 0, left: 0});
       diff.add("search query", {id: "vin diesel", search: "sum salaries per department"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = newSearch("sum salaries per department");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "vin diesel"});
       diff.remove("search query", {id: "vin diesel"});
       eve.applyDiff(diff);
       app.activeSearches["vin diesel"] = null;
     },
     content: () => {
       let search:any = newSearchResults("vin diesel");
       search.leave = {opacity:0, duration: 300},
       search.enter = {opacity:1, duration: 1000, delay: 300, begin: (node) => {
         if(!node[0]) return;
         setTimeout(() => {
           node[0].querySelector(".search-box").editor.refresh();
         }, 30);
       }};
       return {children: [
         search,
         //        {c: "bit entity", text: "George Washington"}
       ]}}
    },
    {type: "slide",
     content: {children: [
       randomlyLetter("To enable that, my search is more powerful than most searches you're used to.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- It's live: you never have to refresh"),
         randomlyLetter("- It's tangible: you can see how I got the result"),
         randomlyLetter("- It's manipulable: you can take the results and do more with them"),
       ]}
     ]}},
    {type: "eve"},
    // {type: "slide",
    //  content: {children: [
    //    randomlyLetter("You can also peer into the past and explore alternative futures.")
    //  ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Through this kind of exploration, I reduce much of programming to searching and formatting the results.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But that is usually just the first step towards a more important goal: communicating.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Fortunately, you can send bits to other people and systems.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can also create documents, dashboards, even custom interfaces, by drawing and embedding bits.")
     ]}},
    // {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("And since what's being sent is itself a bit, others can pull it apart to see how it was made.")
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("They can remix it and create new bits based on the information.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("That enables people to collaborate in a much deeper way.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And one thing I've learned about that collaboration is that it doesn't always mean consensus.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Many versions of a bit can exist; you can have yours and others can have theirs.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But changes can be proposed, approved, and discarded to create a final version.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This allows people to contribute to the overall process, while maintaining control of the end result.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And it allows for different world views and ideas of correctness, which is vital to fitting into the real world.")
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("Instead of pretending like everything will fit neatly into a box...")
     ]}},

    // {type: "slide",
    //  content: {children: [
    //    randomlyLetter("The world is changing and we all have different views into it.")
    //  ]}},
    // {type: "slide",
    //  content: {children: [
    //    {id: "slide-list", c: "list", children: [
    //       randomlyLetter("There's a new version of work: everything revolves around constantly changing data"),
    //       randomlyLetter("New platforms: mobile, voice, pen, VR, AR"),
    //       randomlyLetter("New kinds of systems: everything is distributed"),
    //    ]}
    //  ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am designed to collect, explore and communicate in a world that is constantly changing.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am alive, malleable, and everywhere.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am the approachable genius: honest, genuine, curious, and conversational.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am Eve.")
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("And it's nice to meet you.")
     ]}},
    // {type: "slide",
    //  content: {children: [
    //    randomlyLetter("Questions"),
    //    {id: "slide-list", c: "list", children: [
    //      randomlyLetter("- She vs. it"),
    //      randomlyLetter("- Mobile?"),
    //      randomlyLetter("- What is eve? Jarvis? A workspace? ..?"),
    //    ]}
    //  ]}},
    //  {type: "slide",
    //  content: {children: [
    //    randomlyLetter("Technical questions"),
    //    {id: "slide-list", c: "list", children: [
    //      randomlyLetter("- Incrementalism with cycles"),
    //      randomlyLetter("- Efficient incrementalism in an EAV world"),
    //      randomlyLetter("- Federation"),
    //      randomlyLetter("- Supporting integrations"),
    //      randomlyLetter("- Version control"),
    //      randomlyLetter("- How far can the natural language stuff go, before heuristics stop working?"),
    //      randomlyLetter("- Progressive storage/querying"),
    //    ]}
    //  ]}},
  ]

  function nextSlide(e, elem) {
    let prev:any = slides[slideNumber];
    if(prev.teardown) {
      prev.teardown();
    }
    if(!elem.back) {
      slideNumber++;
    } else {
      slideNumber--;
    }
    if(slideNumber < 0) slideNumber = 0;
    if(slideNumber >= slides.length) slideNumber = slides.length - 1;
    let slide:any = slides[slideNumber];
    if(slide.setup) {
      slide.setup();
    }
    e.stopPropagation();
    e.preventDefault();
    console.log(slideNumber);
    app.render();
  }

  function slideControls() {
    return {c: "slide-controls", children: [
      {c: "ion-ios-arrow-back", back: true, click: nextSlide},
      {c: "ion-ios-arrow-forward", click: nextSlide}
    ]};
  }

  export function root() {
    let slide:any = slides[slideNumber] || {type: "slide"};
    if(slide.type === "slide") {
      let content = slide.content;
      if(typeof content === "function") {
        content = content();
      }
      return {id: "root", c: "root slide", children: [
        slideControls(),
        content
      ]};
    } else {
      var root = wiki.eveRoot();
      root.children.unshift(slideControls());
      return root;
    }
  }
}