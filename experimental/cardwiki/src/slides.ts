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
       diff.add("search", {id: "edward norton", top: 0, left: 0});
       diff.add("search query", {id: "edward norton", search: "edward norton"});
       eve.applyDiff(diff);
       app.activeSearches["edward norton"] = newSearch("edward norton");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "edward norton"});
       diff.remove("search query", {id: "edward norton"});
       eve.applyDiff(diff);
       app.activeSearches["edward norton"] = null;
     },
     content: () => {
       let search:any = newSearchResults("edward norton");
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
    // {type: "eve"},
    {type: "slide",
     content: {children: [
       randomlyLetter("But that malleability doesn't sacrifice the ability to explore.")
     ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("You can navigate through the web of bits you collect and ask complex questions to discover new information.")
     ]}},
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "modern family"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("modern family");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300},
       search.enter = {opacity:1, duration: 1000, delay: 300, begin: (node) => {
         if(!node[0]) return;
         setTimeout(() => {
           node[0].querySelector(".search-box").editor.refresh();
         }, 30);
       }};
       return {children: [
         {c: "row", children :[
           {c: "phrase-container", children : [
              randomlyLetter("For example, here's a bit about Modern Family"),
           ]},
           search,
         ]}
       ]}}
    },
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "episodes of modern family"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("episodes of modern family");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300};
       return {children: [
         {c: "row", children: [
           {c: "phrase-container", children : [
              randomlyLetter("We can ask what episodes we know about for Modern Family"),
           ]},
           search,
         ]}
       ]}}
    },
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "episodes of modern family with edward norton"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("episodes of modern family with edward norton");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300};
       return {children: [
         {c: "row", children :[
           {c: "phrase-container", children : [
              randomlyLetter("And get just the ones that have Edward Norton in them"),
           ]},
           search,
         ]}

       ]}}
    },
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "count the episodes of modern family without edward norton"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("count the episodes of modern family without edward norton");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300};
       return {children: [
         {c: "row", children: [
           {c: "phrase-container", children : [
              randomlyLetter("Or let's count the number of episodes that don't have Norton in them."),
           ]},
           search,
         ]}
       ]}}
    },
    {type: "slide",
     content: {children: [
       randomlyLetter("As you can see, my search is pretty powerful. It also has some important properties.")
     ]}},
    {type: "slide",
     content: {children: [
       {id: "slide-list", c: "list", children: [
         randomlyLetter("- It's live: you never have to refresh"),
         randomlyLetter("- It's tangible: you can see how I got the result"),
         randomlyLetter("- It's manipulable: you can take the results and do more with them"),
       ]}
     ]}},
     {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "sum of salaries per department"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("sum of salaries per department");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300};
       return {children: [
         {c: "row", children: [
           {c: "phrase-container", children : [
              randomlyLetter("Here we have the sum of all the salaries per department, which we store as the 'total cost' per department."),
           ]},
           search,
         ]}
       ]}}
    },
    {type: "slide",
     setup: () => {
       let diff = eve.diff();
       diff.add("search", {id: "episodes", top: 0, left: 0});
       diff.add("search query", {id: "episodes", search: "engineering"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = newSearch("engineering");
     },
     teardown: () => {
       let diff = eve.diff();
       diff.remove("search", {id: "episodes"});
       diff.remove("search query", {id: "episodes"});
       eve.applyDiff(diff);
       app.activeSearches["episodes"] = null;
     },
     content: () => {
       let search:any = newSearchResults("episodes");
       search.leave = {opacity:0, duration: 300};
       return {children: [
         {c: "row", children: [
           {c: "phrase-container", children : [
              randomlyLetter("So now you see that engineering has a total cost."),
           ]},
           search,
         ]}
       ]}}
    },
    // {type: "eve"},
    // {type: "slide",
    //  content: {children: [
    //    randomlyLetter("You can also peer into the past and explore alternative futures.")
    //  ]}},
    {type: "slide",
     content: {children: [
       randomlyLetter("Through this, I reduce much of programming to searching and formatting the results.")
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
       randomlyLetter("This enables people to collaborate in a much deeper way.")
     ]}},
    // {type: "slide",
    //  content: {children: [
    //    randomlyLetter("And one thing I've learned about that collaboration is that it doesn't always mean consensus.")
    //  ]}},
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
       randomlyLetter("It also allows for different world views and ideas of correctness, which is vital to fitting into the real world.")
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
       randomlyLetter("I am alive, malleable, and always available.")
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
       randomlyLetter("It's nice to meet you.")
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

  localStorage["local-eve"] = JSON.stringify({"view":[{"view":"added collections","kind":"union"},{"view":"added eavs","kind":"union"},{"view":"added bits","kind":"union"},{"view":"actor","kind":"query"},{"view":"sum of salaries per department","kind":"query"}],"action":[{"view":"actor","action":"8b291f14-dba1-4824-8135-518708d59917","kind":"select","ix":0},{"view":"actor","action":"a5e147f1-47fc-42d8-9046-56708b4b2423","kind":"project","ix":9007199254740991},{"view":"added collections","action":"actor|actor|person","kind":"union","ix":1},{"view":"sum of salaries per department","action":"6e603912-6ea2-407d-97e4-7bb4f7326b82","kind":"select","ix":0},{"view":"sum of salaries per department","action":"a0cc02a9-ed81-4376-a980-6427c17c6b1d","kind":"select","ix":1},{"view":"sum of salaries per department","action":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","kind":"select","ix":2},{"view":"sum of salaries per department","action":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","kind":"select","ix":3},{"view":"sum of salaries per department","action":"43a910e5-0666-4455-8c36-2476416ff174","kind":"aggregate","ix":4},{"view":"sum of salaries per department","action":"be41214f-9d33-43ac-8a8a-040e588d6343","kind":"group","ix":9007199254740991},{"view":"sum of salaries per department","action":"902c2580-7d66-461a-ac51-c8cb8294b1ff","kind":"project","ix":9007199254740991},{"view":"added eavs","action":"sum of salaries per department|department|total cost|sum","kind":"union","ix":1}],"action source":[{"action":"8b291f14-dba1-4824-8135-518708d59917","source view":"collection entities"},{"action":"actor|actor|person","source view":"actor"},{"action":"6e603912-6ea2-407d-97e4-7bb4f7326b82","source view":"collection entities"},{"action":"a0cc02a9-ed81-4376-a980-6427c17c6b1d","source view":"directionless links"},{"action":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","source view":"collection entities"},{"action":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","source view":"entity eavs"},{"action":"43a910e5-0666-4455-8c36-2476416ff174","source view":"sum"},{"action":"sum of salaries per department|department|total cost|sum","source view":"sum of salaries per department"}],"action mapping":[{"action":"a5e147f1-47fc-42d8-9046-56708b4b2423","from":"actor","to source":"8b291f14-dba1-4824-8135-518708d59917","to field":"entity"},{"action":"actor|actor|person","from":"entity","to source":"actor|actor|person","to field":"actor"},{"action":"a0cc02a9-ed81-4376-a980-6427c17c6b1d","from":"entity","to source":"6e603912-6ea2-407d-97e4-7bb4f7326b82","to field":"entity"},{"action":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","from":"entity","to source":"a0cc02a9-ed81-4376-a980-6427c17c6b1d","to field":"link"},{"action":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","from":"entity","to source":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","to field":"entity"},{"action":"43a910e5-0666-4455-8c36-2476416ff174","from":"value","to source":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","to field":"value"},{"action":"902c2580-7d66-461a-ac51-c8cb8294b1ff","from":"department","to source":"6e603912-6ea2-407d-97e4-7bb4f7326b82","to field":"entity"},{"action":"902c2580-7d66-461a-ac51-c8cb8294b1ff","from":"employee","to source":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","to field":"entity"},{"action":"902c2580-7d66-461a-ac51-c8cb8294b1ff","from":"salary","to source":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","to field":"value"},{"action":"902c2580-7d66-461a-ac51-c8cb8294b1ff","from":"sum","to source":"43a910e5-0666-4455-8c36-2476416ff174","to field":"sum"},{"action":"sum of salaries per department|department|total cost|sum","from":"entity","to source":"sum of salaries per department|department|total cost|sum","to field":"department"},{"action":"sum of salaries per department|department|total cost|sum","from":"value","to source":"sum of salaries per department|department|total cost|sum","to field":"sum"}],"action mapping constant":[{"action":"8b291f14-dba1-4824-8135-518708d59917","from":"collection","value":"actor"},{"action":"actor|actor|person","from":"collection","value":"person"},{"action":"actor|actor|person","from":"source view","value":"actor"},{"action":"6e603912-6ea2-407d-97e4-7bb4f7326b82","from":"collection","value":"department"},{"action":"acd79fb7-e1d1-44ed-af04-4f0137d3d3e1","from":"collection","value":"employee"},{"action":"d911b18d-f9ff-4f34-9b1d-d71b2df3863b","from":"attribute","value":"salary"},{"action":"sum of salaries per department|department|total cost|sum","from":"attribute","value":"total cost"},{"action":"sum of salaries per department|department|total cost|sum","from":"source view","value":"sum of salaries per department"}],"action mapping sorted":[{"action":"be41214f-9d33-43ac-8a8a-040e588d6343","ix":0,"source":"6e603912-6ea2-407d-97e4-7bb4f7326b82","field":"entity","direction":"ascending"}],"action mapping limit":[],"recompile":[],"undefined":[],"manual entity":[{"entity":"person","content":"# people"},{"entity":"modern family","content":"# Modern Family\n\nModern Family is an American television mockumentary that premiered on ABC on September 23, 2009, which follows the lives of Jay Pritchett and his family, all of whom live in suburban Los Angeles. Pritchett's family includes his second wife, his stepson, and infant son, as well as his two adult children and their spouses and children. Christopher Lloyd and Steven Levitan conceived the series while sharing stories of their own \"modern families\". Modern Family employs an ensemble cast. The series is presented in mockumentary style, with the fictional characters frequently talking directly into the camera. The series premiered on September 23, 2009 and was watched by 12.6 million viewers.\n\nSeason 1 Episodes\n1. {Pilot}\n2. {The Bicycle Thief}\n3. {Come Fly with Me}\n4. {The Incident}\n5. {Coal Digger}\n6. {Run for Your Wife}\n7. {En Garde}\n8. {Great Expectations}"},{"entity":"american","content":"# americans"},{"entity":"great expectations","content":"# Great Expectations\n\nAn {is a: episode} of {Modern Family} with {Edward Norton} in it."},{"entity":"edward norton","content":"# Edward Norton\n\nEdward Harrison Norton (born August 18, 1969) is an {is a: American} {is a: actor}, filmmaker and activist. He was nominated for three Academy Awards for his work in the films Primal Fear (1996), American History X (1998) and Birdman (2014). He also starred in other roles, such as Everyone Says I Love You (1996), The People vs. Larry Flynt (1996), Fight Club (1999), Red Dragon (2002), 25th Hour (2002), Kingdom of Heaven (2005), The Illusionist (2006), Moonrise Kingdom (2012) and The Grand Budapest Hotel (2014). He has also directed and co-written films, including his directorial debut, Keeping the Faith (2000). He has done uncredited work on the scripts for The Score, Frida and The Incredible Hulk.\n\nHe is {age: 46} years old."},{"entity":"coal digger","content":"# Coal Digger\n\nThe fifth {is a: episode} of {Modern Family}."},{"entity":"pilot","content":"# Pilot\n\nThe first {is a: episode} of {modern family}."},{"entity":"the bicycle thief","content":"# The Bicycle Thief\n\nThe second {is a: episode} of {Modern Family}."},{"entity":"come fly with me","content":"# Come Fly with Me\n\nThe third {is a: episode} of {Modern Family}."},{"entity":"the incident","content":"# The Incident\n\nThe fourth {is a: episode} of {Modern Family}."},{"entity":"run for your wife","content":"# Run for Your Wife\n\nThe sixth {is a: episode} of {Modern Family}."},{"entity":"en garde","content":"# En Garde\n\nThe seventh {is a: episode} of {Modern Family}."},{"entity":"actor","content":"# Actors\n\nAn actor (actress is sometimes used for females) is a person portraying a character in a dramatic or comic production; he or she performs in film, television, theatre, radio, commercials or music videos. Actor, ὑποκριτής (hypokrites), literally means \"one who interprets\"; an actor, then, is one who interprets a dramatic character. Method acting is an approach in which the actor identifies with the portrayed character by recalling emotions or reactions from his or her own life. Presentational acting refers to a relationship between actor and audience, whether by direct address or indirectly by specific use of language, looks, gestures or other signs indicating that the character or actor is aware of the audience's presence. In representational acting, \"actors want to make us 'believe' they are the character; they pretend.\""},{"entity":"vin diesel","content":"# Vin Diesel\n\nMark Sinclair (born July 18, 1967), better known by his stage name Vin Diesel, is an {is a: American} {is a: actor}. He is best known for his portrayals of Dominic Toretto in The Fast and the Furious film series and Richard B. Riddick in The Chronicles of Riddick trilogy. He also was a producer on sequels in both franchises.\nDiesel has also starred in films such as xXx (2002) and Find Me Guilty (2006). His voice acting work includes The Iron Giant (1999), the video game spin-offs from The Chronicles of Riddick franchise, and Guardians of the Galaxy (2014). He wrote, directed, produced, and starred in a short film titled Multi-Facial and the feature-length drama film Strays. He is the founder of the production companies One Race Films, Racetrack Records, and Tigon Studios."},{"entity":"engineering","content":"# Engineering\n\nEngineering is a {is a: department} at {company: Kodowa}.\n\nEmployees:\n{Chris Granger}\n{Josh Cole}\n{Corey Montella}\n{Jamie Brandon}"},{"entity":"chris granger","content":"# Chris Granger\n\nAn {is a: employee} of {company: Kodowa}.\n\nHe has a salary of {salary: 1}."},{"entity":"josh cole","content":"# Josh Cole\n\nAn {is a: employee} of {company: Kodowa}.\n\nHe has a salary of {salary: 2}."},{"entity":"corey montella","content":"# Corey Montella\n\nAn {is a: employee} of {company: Kodowa}.\n\nHe has a salary of {salary: 2}."},{"entity":"jamie brandon","content":"# Jamie Brandon\n\nAn {is a: employee} of {company: Kodowa}.\n\nHe has a salary of {salary: 3}."},{"entity":"operations","content":"# Operations\n\nOperations is a {is a: department} at {company: Kodowa}.\n\nEmployees:\n{Robert attorri}"},{"entity":"robert attorri","content":"# Robert Attorri\n\nAn {is a: employee} at {company: Kodowa}.\n\nHis salary is {salary: 2}"}],"search":[{"id":"abc42cb9-4be4-4bbc-8fee-aa942b31dfc9","top":98,"left":99}],"search query":[{"id":"abc42cb9-4be4-4bbc-8fee-aa942b31dfc9","search":"sum of salaries per department"}],"history stack":[{"entity":"foo","pos":0},{"entity":"edward norton","pos":1},{"entity":"Modern Family","pos":2},{"entity":"modern family","pos":3},{"entity":"actor","pos":4},{"entity":"people","pos":5},{"entity":"person","pos":6},{"entity":"people in modern family","pos":7},{"entity":"actors in modern family","pos":8},{"entity":"actors related to edward norton","pos":9},{"entity":"the bicylce thief","pos":10},{"entity":"great expectations","pos":11},{"entity":"american","pos":12},{"entity":"pilot","pos":13},{"entity":"episodes of modern family with edward norton","pos":14},{"entity":"episodes of modern family","pos":15},{"entity":"episode","pos":16},{"entity":"the bicycle thief","pos":17},{"entity":"come fly with me","pos":18},{"entity":"the incident","pos":19},{"entity":"coal digger","pos":20},{"entity":"run for your wife","pos":21},{"entity":"en garde","pos":22},{"entity":"episodes of modern family without edward norton","pos":23},{"entity":"episodes","pos":24},{"entity":"count the episodes of modern family without edward norton","pos":25},{"entity":"count the episodes of modern family with edward norton","pos":26},{"entity":"count episodes of modern family without edward norton","pos":27},{"entity":"Vin Diesel","pos":28},{"entity":"Actors","pos":29},{"entity":"Actors related to modern family","pos":30},{"entity":"vin diesel","pos":31},{"entity":"count episodes grouped by edward norton","pos":32},{"entity":"count episodes","pos":33},{"entity":"count episodes of modern family","pos":34},{"entity":"count episodes of modern family with edward norton","pos":35},{"entity":"Edward Norton","pos":36},{"entity":"engineering","pos":37},{"entity":"chris granger","pos":38},{"entity":"josh cole","pos":39},{"entity":"corey montella","pos":40},{"entity":"jamie brandon","pos":41},{"entity":"salaries per department","pos":42},{"entity":"","pos":43},{"entity":"sum of salaries per department","pos":44},{"entity":"operations","pos":45},{"entity":"robert attorri","pos":46}],"add collection action":[{"view":"actor","action":"actor|actor|person","field":"actor","collection":"person"}],"editing":[],"showPlan":[],"adding action":[],"add eav action":[{"view":"sum of salaries per department","action":"sum of salaries per department|department|total cost|sum","entity":"department","attribute":"total cost","field":"sum"}]});
}