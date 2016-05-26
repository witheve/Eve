choose test
  #tv-nerds: person
    location: "party"
    conversing-with: me
    favorite-show: show
    favorite-hobby: hobby
  choose
    @me: me
      favorite-show: show
    add
      #conversation
        between: me
        between: person
        about: show
  or
    @me: me
      favorite-hobby: hobby
    add
      #conversation
        between: me
        between: person
        about: hobby
  or
    add
      #conversation
        between: me
        between person:
        about: "weather"
        quality: "shitty"
