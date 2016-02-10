import * as app from "../src/app";
import * as runtime from "../src/runtime";
import "../src/wiki";

var eve = runtime.addProvenanceTable(new runtime.Indexer());
window["eve"] = eve;

app.init("runtime test", () => {
	app.renderRoots = {};
	var testData = eve.diff();
	testData.add("foo", {a: 1, b: 2});
	testData.add("foo", {a: 2, b: 3});
	testData.add("foo", {a: 2, b: 4});
	testData.add("bar", {a: 2, c: 5});
	testData.add("bar", {a: 2, c: 6});
	testData.remove("system ui", {template: "wiki root"});
	eve.applyDiff(testData);


	var query1 = eve.query("no group test")
					.select("foo", {}, "foo")
					.select("bar", {a: ["foo", "a"]}, "bar")
					.project({c: ["bar", "c"]});
	var res = query1.exec();
    console.log(res);

	var query2 = eve.query("group test")
					.select("foo", {}, "foo")
					.select("bar", {a: ["foo", "a"]}, "bar")
					.group([["foo", "b"]])
					.aggregate("count", {}, "count")
					.project({b: ["foo", "b"], count: ["count", "count"]});
	var res2 = query2.debug();
    console.log(res2);

	var provenance = eve.diff();
	provenance.addMany("provenance", res.provenance);
	provenance.addMany("provenance", res2.provenance);
	provenance.addMany("no group test", res.results);
	provenance.addMany("group test", res2.results);
	eve.applyDiff(provenance);

	function foo(changes, meh) {
		let others = [];
		if(changes["bar"] && changes["bar"].adds) {
			for(let change0 of changes["bar"].adds) {
				let rows1 = eve.find("foo", {a: change0["a"]});
				for(let row1 of rows1) {
					others.push(row1);
				}
			}
		}
		if(changes["foo"] && changes["foo"].adds) {
			for(let change of changes["foo"].adds) {
				others.push(change);
			}
		}
		return others
	}

    var func = query1.incrementalRowFinder;
	console.log(func);

	console.log(func({}));
	console.log(func({"foo": {adds: [{a: 2, b:7}]}}));
	console.log(func({"bar": {adds: [{a: 2, c:7}]}}));
	console.log(func({"foo": {adds: [{a: 2, b:7}]}, "bar": {adds: [{a: 2, c:7}]}}));

    eve.asView(query1);
    eve.asView(query2);

    var changeInfo = {"foo": {adds: [{a: 2, b:7}]}, "bar": {adds: [{a: 2, c:7}]}};
    var changes = eve.diff();
    changes.remove("foo", {a: 2, b: 3});
    // changes.remove("bar", {a: 2, c: 5});
    // changes.remove("bar", {a: 2, c: 6});
    eve.applyDiffIncremental(changes);

    // changeInfo["bar"] = undefined;
    // var incremental = query1.execIncremental(changeInfo, eve.table(query1.name));
    // console.log(incremental);
	  // var incremental2 = query2.execIncremental(changeInfo, eve.table(query2.name));
    // console.log(incremental2);

	var parentAncestor = eve.query("parent ancestor")
						 .select("parent", {}, "parent")
						 .select("ancestor", {ancestor: ["parent", "child"]}, "ancestor")
						 .project({ancestor: ["parent", "parent"], child: ["ancestor", "child"]});
    eve.asView(parentAncestor);

	var ancestorUnion = eve.union("ancestor")
						   .union("parent", {ancestor: ["parent"], child: ["child"]})
						   .union("parent ancestor", {ancestor: ["ancestor"], child: ["child"]});
    eve.asView(ancestorUnion);
	var parents = eve.diff();
	parents.addMany("parent", [{parent: "a", child: "b"}, {parent: "b", child: "c"}]);
	eve.applyDiffIncremental(parents);

});
