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
       randomlyLetter("There are some serious advantages to collecting information in bits.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Capture information however it comes."),
         randomlyLetter("- No planning or pre-structuring"),
         randomlyLetter("- Nothing is too big or too small"),
         randomlyLetter("- Not just tables, it's the whole story"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I can also pull in information from the outside world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But the most important thing is that I was designed to be malleable.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can..."),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Add structure at any time"),
         randomlyLetter("- Work with heterogenous collections"),
         randomlyLetter("- Handle one off tasks"),
         randomlyLetter("- Cleanly deal with special cases"),
       ]}
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("The purpose of collecting all this is to explore it.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But I likely mean something different than what you're thinking.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Exploration isn't just navigation. It's discovering new information.")
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
       randomlyLetter("My search is more powerful than most searches you're used to.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- It's live"),
         randomlyLetter("- It's tangible"),
         randomlyLetter("- It's manipulable"),
       ]}
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("I can also peer into the past and help explore alternative futures.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Exploration is simply a matter of searching and formatting the results.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But you also need to be able to communicate, not just explore.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Fortunately, you can send bits to other people and systems. You can even search over the communcations themselves.")
     ]}},
    {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("Communicating isn't just about sending messages though. It's about representing information in useful ways.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can create documents, dashboards, even custom interfaces, by drawing and embedding bits.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And you can still pull them apart to see how they're made.")
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("That allows people to explore beyond what you send them. They can remix it and create new bits based on the information.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This enables people to collaborate in a much deeper way.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Sometimes we are just exploring by ourselves, but much of the time there are teams, businesses, even times when we want to work with the whole world.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("One thing I've learned about collaboration is that that doesn't always mean consensus.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Instead, many versions of a bit can exist, you can have yours and others can have theirs.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("But we can still propose changes to each other and select people to approve updates to the final version.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This enables others to contribute to the overall process, while maintaining control of the end result.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("This form of collaboration also allows for different world views and different ideas of correctness.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Which is important because I was meant to fit in the real world, not some idealized version where everything fits neatly in a box.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("And it is that world that is rapidly becoming something new.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("There are new inputs: pen, voice"),
         randomlyLetter("New displays: mobile, VR, AR"),
         randomlyLetter("New kinds of systems: everything is distributed"),
         randomlyLetter("New version of work: everything is constantly changing data"),
       ]}
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("I am built to collect, explore and communicate in that world.")
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
       randomlyLetter("Questions"),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- She vs. it"),
         randomlyLetter("- Mobile?"),
         randomlyLetter("- What is eve? Jarvis? A workspace? ..?"),
       ]}
     ]}},
     {type: "slide",
     content: {children: [
       randomlyLetter("Technical questions"),
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- Incrementalism with cycles"),
         randomlyLetter("- Efficient incrementalism in an EAV world"),
         randomlyLetter("- Federation"),
         randomlyLetter("- Supporting integrations"),
         randomlyLetter("- Version control"),
         randomlyLetter("- How far can the natural language stuff go, before heuristics stop working?"),
         randomlyLetter("- Progressive storage/querying"),
       ]}
     ]}},
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
    if(false) {
      let content = slide.content;
      if(typeof content === "function") {
        content = content();
      }
      return {id: "root", c: "root slide", children: [
        slideControls(),
        content
      ]};
    } else {
      return wiki.eveRoot();
    }
  }
}