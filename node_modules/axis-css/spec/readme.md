Testing Roots CSS
-----------------

Testing a css framework is a strange thing because it's very visual and less logic-based. During development, I would go through and test each mixin by putting it on a page then tweaking it until it was right. Essentially, I was looking for two things: does the mixin work and not throw an error when called with any combination of parameters, and does the mixin look the way I want it to.

The way I landed on eventually for testing is to create a page that contains every mixin called in every legitimate way. When the tests are run, phantomjs goes over the page and takes a screenshot of each element, dropping all the pictures into a folder. If any of the mixins are broken, the page won't render and the tests will fail right away. Otherwise, before a big release everything should be verified by running the test and making sure all the images in the folder look ok.

### Testing Setup

- install [casperjs](http://casperjs.org/) with `brew install casperjs`
- run `./server` from the project root
- in a new terminal tab, run `./test`
- profit!