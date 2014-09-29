program("simple output",
  table("foo", ["id"]),
  table("bar", ["id"]),
  rule("",
       source("foo", {id: "id"}),
       sink("bar", {id: "id"}))
)
.update([["foo", 0], ["foo", 1]], [])
.refresh()
.test([["bar", 0], ["bar", 1]]);

program("simple join",
  table("foo", ["id", "name"]),
  table("bar", ["id"]),
  table("quux", ["name"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       source("bar", {id: "id"}),
       sink("quux", {name: "name"}))
)
.update([["foo", 0, "jamie"], ["foo", 1, "chris"], ["foo", 2, "rob"], ["bar", 1], ["bar", 3]], [])
.refresh()
.test([["quux", "chris"]]);


program("sorted aggregate",
  table("foo", ["id"]),
  table("bar", ["ids"]),
  rule("",
       source("foo", {id: "id"}),
       aggregate([], ["id"]),
       reduce("ids", "id", "id.join()"),
       sink("bar", {ids: "ids"}))
)
.update([["foo", 0], ["foo", 1], ["foo", 2]], [])
.refresh()
.test([["bar", "0,1,2"]]);

program("grouped aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"]),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"}))
)
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie,rob"], ["bar", "chris"]]);

program("limited aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], "id"),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"}))
)
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie"]]);

program("constant limited aggregate",
  table("foo", ["id", "name"]),
  table("bar", ["names"]),
  rule("",
       source("foo", {id: "id", name: "name"}),
       aggregate(["id"], ["name"], 1),
       reduce("names", "name", "name.join()"),
       sink("bar", {names: "names"}))
)
.update([["foo", 1, "jamie"], ["foo", 1, "rob"], ["foo", 0, "chris"]], [])
.refresh()
.test([["bar", "jamie"], ["bar", "chris"]]);

program("filter",
  table("foo", ["id"]),
  table("bar", ["id"]),
  rule("",
       source("foo", {id: "id"}),
       calculate("more", ["id"], "id + 5"),
       constant("more", 23),
       sink("bar", {id: "id"}))
)
.update([["foo", 18], ["foo", 20]], [])
.refresh()
.test([["bar", 18]]);

var testMultiplier = 1;
if(typeof window === "undefined") {
  testMultiplier = process.env.TESTMULTIPLIER || 1;
}
