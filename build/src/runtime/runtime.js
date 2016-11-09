//---------------------------------------------------------------------
// Runtime
//---------------------------------------------------------------------
"use strict";
var performance_1 = require("./performance");
var TRACK_PERFORMANCE = true;
var MAX_ROUNDS = 30;
var indexes_1 = require("./indexes");
var changes_1 = require("./changes");
var id_1 = require("./id");
//---------------------------------------------------------------------
// Database
//---------------------------------------------------------------------
var Database = (function () {
    function Database() {
        this.id = "db|" + Database.id;
        Database.id++;
        this.evaluations = [];
        this.blocks = [];
        this.index = new indexes_1.TripleIndex(0);
    }
    Database.prototype.register = function (evaluation) {
        if (this.evaluations.indexOf(evaluation) === -1) {
            this.evaluations.push(evaluation);
        }
    };
    Database.prototype.unregister = function (evaluation) {
        var evals = this.evaluations;
        var index = evals.indexOf(evaluation);
        if (index > -1) {
            evals.splice(index, 1);
        }
        else {
            throw new Error("Trying to unregister an evaluation that isn't registered with this database");
        }
    };
    Database.prototype.onFixpoint = function (currentEvaluation, changes) {
        var name = currentEvaluation.databaseToName(this);
        var commit = changes.toCommitted((_a = {}, _a[name] = true, _a));
        if (commit.length === 0)
            return;
        for (var _i = 0, _b = this.evaluations; _i < _b.length; _i++) {
            var evaluation = _b[_i];
            if (evaluation !== currentEvaluation) {
                evaluation.queue(commit);
            }
        }
        var _a;
    };
    Database.prototype.toTriples = function () {
        return this.index.toTriples(true);
    };
    Database.prototype.analyze = function (e, d) { };
    Database.id = 1;
    return Database;
}());
exports.Database = Database;
//---------------------------------------------------------------------
// Evaluation
//---------------------------------------------------------------------
var Evaluation = (function () {
    function Evaluation(index) {
        this.queued = false;
        this.commitQueue = [];
        this.databases = [];
        this.databaseNames = {};
        this.nameToDatabase = {};
        this.multiIndex = index || new indexes_1.MultiIndex();
        if (TRACK_PERFORMANCE) {
            this.perf = new performance_1.PerformanceTracker();
        }
        else {
            this.perf = new performance_1.NoopPerformanceTracker();
        }
    }
    Evaluation.prototype.error = function (kind, error) {
        if (this.errorReporter) {
            this.errorReporter(kind, error);
        }
        else {
            console.error(kind + ":", error);
        }
    };
    Evaluation.prototype.unregisterDatabase = function (name) {
        var db = this.nameToDatabase[name];
        delete this.nameToDatabase[name];
        if (!db)
            return;
        this.databases.splice(this.databases.indexOf(db), 1);
        delete this.databaseNames[db.id];
        this.multiIndex.unregister(name);
        db.unregister(this);
    };
    Evaluation.prototype.registerDatabase = function (name, db) {
        if (this.nameToDatabase[name]) {
            throw new Error("Trying to register a database name that is already registered");
        }
        for (var _i = 0, _a = this.databases; _i < _a.length; _i++) {
            var database = _a[_i];
            db.analyze(this, database);
            database.analyze(this, db);
        }
        this.databases.push(db);
        this.databaseNames[db.id] = name;
        this.nameToDatabase[name] = db;
        this.multiIndex.register(name, db.index);
        db.register(this);
    };
    Evaluation.prototype.databaseToName = function (db) {
        return this.databaseNames[db.id];
    };
    Evaluation.prototype.getDatabase = function (name) {
        return this.nameToDatabase[name];
    };
    Evaluation.prototype.blocksFromCommit = function (commit) {
        var perf = this.perf;
        var start = perf.time();
        var blocks = [];
        var index = this.multiIndex;
        var tagsCache = {};
        for (var _i = 0, _a = this.databases; _i < _a.length; _i++) {
            var database = _a[_i];
            if (database.nonExecuting)
                continue;
            for (var _b = 0, _c = database.blocks; _b < _c.length; _b++) {
                var block = _c[_b];
                if (block.dormant)
                    continue;
                var checker = block.checker;
                for (var ix = 0, len = commit.length; ix < len; ix += 6) {
                    var change = commit[ix];
                    var e = commit[ix + 1];
                    var a = commit[ix + 2];
                    var v = commit[ix + 3];
                    var tags = tagsCache[e];
                    if (tags === undefined) {
                        tags = tagsCache[e] = index.dangerousMergeLookup(e, "tag", undefined);
                    }
                    if (checker.check(index, change, tags, e, a, v)) {
                        blocks.push(block);
                        break;
                    }
                }
            }
        }
        perf.blockCheck(start);
        // console.log("executing blocks", blocks.map((x) => x));
        return blocks;
    };
    Evaluation.prototype.getAllBlocks = function () {
        var blocks = [];
        for (var _i = 0, _a = this.databases; _i < _a.length; _i++) {
            var database = _a[_i];
            if (database.nonExecuting)
                continue;
            for (var _b = 0, _c = database.blocks; _b < _c.length; _b++) {
                var block = _c[_b];
                if (block.dormant)
                    continue;
                blocks.push(block);
            }
        }
        return blocks;
    };
    Evaluation.prototype.queue = function (commit) {
        var _this = this;
        if (!commit.length)
            return;
        if (!this.queued) {
            var self_1 = this;
            process.nextTick(function () {
                var commits = [];
                for (var _i = 0, _a = self_1.commitQueue; _i < _a.length; _i++) {
                    var queued = _a[_i];
                    for (var _b = 0, queued_1 = queued; _b < queued_1.length; _b++) {
                        var field = queued_1[_b];
                        commits.push(field);
                    }
                }
                _this.fixpoint(new changes_1.Changes(_this.multiIndex), _this.blocksFromCommit(commits));
            });
        }
        this.commitQueue.push(commit);
    };
    Evaluation.prototype.createChanges = function () {
        return new changes_1.Changes(this.multiIndex);
    };
    Evaluation.prototype.executeActions = function (actions, changes) {
        if (changes === void 0) { changes = this.createChanges(); }
        for (var _i = 0, actions_1 = actions; _i < actions_1.length; _i++) {
            var action = actions_1[_i];
            action.execute(this.multiIndex, [], changes);
        }
        var committed = changes.commit();
        return this.fixpoint(changes, this.blocksFromCommit(committed));
    };
    Evaluation.prototype.fixpoint = function (changes, blocks) {
        if (changes === void 0) { changes = new changes_1.Changes(this.multiIndex); }
        if (blocks === void 0) { blocks = this.getAllBlocks(); }
        var perf = this.perf;
        var start = perf.time();
        var commit;
        changes.changed = true;
        while (changes.changed && changes.round < MAX_ROUNDS) {
            changes.nextRound();
            // console.groupCollapsed("Round" + changes.round);
            for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
                var block = blocks_1[_i];
                var start_1 = perf.time();
                block.execute(this.multiIndex, changes);
                perf.block(block.id, start_1);
            }
            // console.log(changes);
            commit = changes.commit();
            blocks = this.blocksFromCommit(commit);
        }
        if (changes.round >= MAX_ROUNDS) {
            this.error("Fixpoint Error", "Evaluation failed to fixpoint");
        }
        perf.fixpoint(start);
        // console.log("TOTAL ROUNDS", changes.round, perf.time(start));
        // console.log(changes);
        for (var _a = 0, _b = this.databases; _a < _b.length; _a++) {
            var database = _b[_a];
            database.onFixpoint(this, changes);
        }
        return changes;
    };
    Evaluation.prototype.save = function () {
        var results = {};
        for (var _i = 0, _a = this.databases; _i < _a.length; _i++) {
            var database = _a[_i];
            var name_1 = this.databaseToName(database);
            var values = database.toTriples();
            for (var _b = 0, values_1 = values; _b < values_1.length; _b++) {
                var value = values_1[_b];
                var e = value[0], a = value[1], v = value[2], n = value[3];
                if (id_1.ids.isId(e))
                    value[0] = id_1.ids.parts(e);
                if (id_1.ids.isId(v))
                    value[2] = id_1.ids.parts(v);
            }
            results[name_1] = values;
        }
        return results;
    };
    Evaluation.prototype.load = function (dbs) {
        var changes = this.createChanges();
        for (var _i = 0, _a = Object.keys(dbs); _i < _a.length; _i++) {
            var databaseName = _a[_i];
            var facts = dbs[databaseName];
            var db = this.getDatabase(databaseName);
            var index = db.index;
            for (var _b = 0, facts_1 = facts; _b < facts_1.length; _b++) {
                var fact = facts_1[_b];
                var e = fact[0], a = fact[1], v = fact[2], n = fact[3];
                if (id_1.ids.isId(e))
                    e = id_1.ids.load(e);
                if (id_1.ids.isId(v))
                    v = id_1.ids.load(v);
                changes.store(databaseName, e, a, v, n);
            }
        }
        this.executeActions([], changes);
    };
    Evaluation.prototype.close = function () {
        for (var _i = 0, _a = this.databases; _i < _a.length; _i++) {
            var database = _a[_i];
            database.unregister(this);
        }
    };
    return Evaluation;
}());
exports.Evaluation = Evaluation;
//# sourceMappingURL=runtime.js.map