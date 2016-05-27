-----------------
Handle Events
-----------------

click on a restaurant or pin, show a restaurant
  app = [@app]
  [#click element]
  choose
    element = [#yelp-restaurant-list-element restaurant]
  or
    element = [#yelp-restaurant-pin restaurant]
  end
  update history
    app.selected := restaurant
    app.content := "restaurant"
  end

click on yelp logo, show map
  app = [@app]
  [#click element]
  element = [#yelp-logo]
  update history
    app.content := "map"
  end

-----------------
Draw the page
-----------------

draw the selected restaurant
  [@app content: "restaurant", selected: restaurant]
  root = [@yelp-root]
  restaurant = [#restaurant name image]
  update
    root.children += [#div class: "restaurant-info", children: 
                        [#div class: "info-header", children:
                          [#h2 text: name]
                          [#div children: 
                            [#img src: image]]]]
  end

draw the map pane
  [@app content: "map"]
  root = [@yelp-root]
  [#restaurant street city state zip]
  [#address-to-latlon street city state zip lat long]
  update
    root.children = [#map class: "map", pins: [#yelp-restaurant-pin lat lon]]
  end

draw the restaurant list
  restaurant = [#restaurant name rating]
  root = [@yelp-root]
  star-image = "star{rating}.png"
  update
    root.children += [#div class: "restaurant-list-container" children:
                      [#div class: "restaurant-list-header" children: [#h1 text: "Restaurants"]]
                      [#div class: "restaurant-list-elements" children:
                        [#div #yelp-restaurant-list-element, class: "restaurant-list-element",
                          restaurant, name, star-image, children:
                          [#h1 text: name]
                          [#img src: star-image]]]]
  end

draw the main page
  update 
    [#div @yelp-root class: "yelp-root", children: 
      [#div class: "header", children: [#h1 #yelp-logo text: "Yelp"]]]
  end