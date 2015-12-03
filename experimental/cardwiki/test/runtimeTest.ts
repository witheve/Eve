import * as app from "../src/app";
import * as runtime from "../src/runtime";
import "../src/wiki";

var eve = app.eve;

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


	var query1 = eve.query("no group")
					.select("foo", {}, "foo")
					.select("bar", {a: ["foo", "a"]}, "bar")
					.project({c: ["bar", "c"]});
	var res = query1.exec();

	var query2 = eve.query("group")
					.select("foo", {}, "foo")
					.select("bar", {a: ["foo", "a"]}, "bar")
					.group([["foo", "b"]])
					.aggregate("count", {}, "count")
					.project({b: ["foo", "b"], count: ["count", "count"]});
	var res2 = query2.exec();

	var provenance = eve.diff();
	provenance.addMany("provenance", res.provenance);
	provenance.addMany("provenance", res2.provenance);
	eve.applyDiff(provenance);

	// given a set of changes and a join order, determine the root facts that need
	// to be joined again to cover all the adds
	function reverseJoin(query, joins) {
		let code = "";
		let changed = joins[0];

		let reverseJoinMap = {};
		// collect all the constraints and reverse them
		for(let join of joins) {
			console.log(join);
			for(let key in join.join) {
				console.log(join.join);
				let [source, field] = join.join[key];
				if(source <= changed.ix) {
					if(!reverseJoinMap[source]) {
						reverseJoinMap[source] = {};
					}
					reverseJoinMap[source][field] = [join.ix, key];
				}
			}
		}

		console.log("revjoinmap", reverseJoinMap);

		// for(let join of joins) {
		// 	let {table, ix, negated} = join;
		// 	// we only care about this guy if he's joined with at least one thing
		// 	if(Object.keys(prev.join).length === 0) {
		// 		prev = join;
		// 		continue;
		// 	}
		// 	for(let key in prev.join) {
		// 		console.log(join.ix, key, prev.join[key]);
		// 	}
		// 	if(negated) {
		// 		//@TODO: deal with negation;
		// 	}

		// 	prev = join;
		// }
		return code;
	}
	function newAsToJoin(query) {
		let code = "var others = [];\n";
		let reversed = query.joins.slice().reverse();
		let ix = 0;
		for(let join of reversed) {
			code += `
			if(changes["${join.table}"] && changes["${join.table}"].adds) {
				for(change${join.ix} of changes["${join.table}"].adds) {\n
					${reverseJoin(query, reversed.slice(ix))}
				}
			}`;
			ix++;
			// we don't want to do this for the root
			if(ix === reversed.length - 1) break;
		}
		var last = reversed[ix];
		code += `
			if(changes["${last.table}"] && changes["${last.table}"].adds) {
				for(let change of changes["${last.table}"].adds) {
					others.push(change);
				}
			}
			return others;`;
		return code;
	}

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

	console.log(newAsToJoin(query1));

	console.log(foo({}, query1.joins));
	console.log(foo({"foo": {adds: [{a: 2, b:7}]}}, query1.joins));
	console.log(foo({"bar": {adds: [{a: 2, b:7}]}}, query1.joins));
	console.log(foo({"foo": {adds: [{a: 2, b:7}]}, "bar": {adds: [{a: 2, b:7}]}}, query1.joins));

});
