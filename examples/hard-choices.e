choose test
  me = [@me]
  person = [#tv-nerds location: "party" conversing-with: [@me],
            favorite-show: show, favorite-hobby: hobby]
  (about, quality) =
    if me.favorite-show = show then (show, "high")
    else if me.favorite-hobby = hobby then (hobby, "ok")
    else ("weather", "shitty")
  update
    [#conversation between: me, between: person, about, quality]
