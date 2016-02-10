var app = require("../src/app");
var nlqp = require("../src/NLQueryParser");
var bootstrap = require("../src/bootstrap");
var dslparser = require("../src/parser");
var app_1 = require("../src/app");
// @HACK needed because browserify is being too clever by
// optimizing away unused code
var boostrapIxer = bootstrap.ixer;
app.renderRoots["nlqp"];
nlqp.debug = true;
function parseTest(queryString, n) {
    var parseResult;
    var avgTime = 0;
    var maxTime = 0;
    var minTime;
    var preTags = nlqp.preprocessQueryString(queryString);
    var pretagsToString = preTags.map(function (pt) { return ("(" + pt.text + "|" + pt.tag + ")"); }).join("");
    // Parse string and measure how long it takes
    for (var i = 0; i < n; i++) {
        var start = performance.now();
        parseResult = nlqp.parse(queryString)[0];
        var stop = performance.now();
        avgTime += stop - start;
        if (stop - start > maxTime) {
            maxTime = stop - start;
        }
        if (minTime === undefined) {
            minTime = stop - start;
        }
        else if (stop - start < minTime) {
            minTime = stop - start;
        }
    }
    // Display result
    var tokenStrings = nlqp.tokenArrayToString(parseResult.tokens);
    var timingDisplay = "Timing (avg, max, min): " + (avgTime / n).toFixed(2) + " | " + maxTime.toFixed(2) + " | " + minTime.toFixed(2) + " ";
    console.log(queryString);
    console.log(pretagsToString);
    console.log("State: " + nlqp.StateFlags[parseResult.state]);
    console.log(parseResult.context);
    console.log("-------------------------------------------------------------------------------------------");
    console.log("Tokens");
    console.log(tokenStrings);
    console.log("-------------------------------------------------------------------------------------------");
    console.log("Tree");
    console.log(parseResult.tree.toString());
    console.log("-------------------------------------------------------------------------------------------");
    console.log("Query");
    console.log("-------------------------------------------------------------------------------------------");
    console.log("Result");
    console.log(queryString);
    console.log(executeQuery(parseResult.query).join("\n"));
    console.log("-------------------------------------------------------------------------------------------");
    console.log(timingDisplay);
    console.log("===========================================================================================");
    return parseResult.state;
}
function executeQuery(query) {
    var resultsString = [];
    if (query.projects.length !== 0) {
        var queryString = query.toString();
        console.log(queryString);
        var artifacts = dslparser.parseDSL(queryString);
        var changeset = app_1.eve.diff();
        var results = [];
        for (var id in artifacts.views) {
            app_1.eve.asView(artifacts.views[id]);
        }
        for (var id in artifacts.views) {
            results.push(artifacts.views[id].exec());
        }
        console.log(results);
        results.forEach(function (result) {
            var projected = result.results;
            if (projected.length === 0) {
                return;
            }
            // Get each cell as a string
            var colWidths = [];
            var keys = Object.keys(projected[0]);
            keys.forEach(function (key) { colWidths.push(key.length); });
            var rows = projected.map(function (row) {
                var rowstring = keys.map(function (key, i) {
                    if (key === "__id") {
                        return "";
                    }
                    var value = "" + row[key];
                    var display = app_1.eve.findOne("display name", { id: value });
                    if (display !== undefined) {
                        value = display.name;
                    }
                    // Get the width of each row
                    if (colWidths[i] < value.length) {
                        colWidths[i] = value.length;
                    }
                    return value;
                });
                return rowstring;
            });
            // Turn rows into row strings
            var rowStrings = rows.map(function (row) {
                row = row.map(function (cell, i) {
                    var whitespace = Array(colWidths[i] - cell.length + 1).join(" ");
                    cell += whitespace;
                    return cell;
                });
                return "| " + row.join(" | ");
            });
            // Add a table header
            var tableHeader = "| " + keys.map(function (key, i) {
                if (key === "__id") {
                    return "";
                }
                var whitespace = Array(colWidths[i] - key.length + 1).join(" ");
                return key.toUpperCase() + whitespace;
            }).join(" | ");
            var divider = Array(tableHeader.length).join("-");
            var resultTable = divider += "\n" + tableHeader + "\n" + divider + "\n" + rowStrings.join("\n") + "\n" + divider;
            resultsString.push(resultTable);
        });
    }
    return resultsString;
}
var n = 1;
var phrases = [
    // -------------------------------
    // These are queries that we had problems with in the past
    // make sure they always work
    // -------------------------------
    //"sum of employee salaries",
    "+ 1 3"
];
/*
let siriphrases = [
  "Find videos I took at Iva's birthday party",
  "Find pics from my trip to Aspen in 2014",
  "Find a table for four people tonight in Chicago",
  "Find a table for four tonight in Chicago",
  "How is the weather tomorrow?",
  "Wake me up at 7AM tomorrow",
  "Move my 2PM meeting to 2:30",
  "Do I have any new texts from Rick?",
  "Show my selfies from New Year's Eve",
  "Call Dad at work",
  "Aiesha Turner is my mom",
  "Read my latest email",
  "Text peet 'See you soon smiley exlamation point'",
  "What is trending on Twitter?",
  "Call back my last missed call.",
  "Where is Brian?",
  "Find tweets with the hashtag BayBridge",
  "Read my last message from Andrew",
  "Do I have any new voicemail?",
  "FaceTime Sarah",
  "Redial that last number",
  "Play the last voicemail from Aaron",
  "When did Ingrid call me?",
  "Get my call history",
  "Mark the third one complete",
  "Add Greg to my 2:30 meeting on Thursday",
  "Remind me about this email Friday at noon", // noon should be a quantity
  "Create a new list called Groceries", // why isn't a|DT includeded in "a new list"
  "Where is my next meeting?", // How can we make meeting a noun?
  "Set an alarm for 9 AM every Friday", // AM needs to be special cased to attach to 9
  "Cancel my meetings on Friday", // Cancel needs to be a verb
  "Turn off all my alarms",
  "Add brussels sprouts to my grocery list",
  "Remind me to pay Noah back tomorrow morning",
  // Sports
  "When is the next Mavericks home game?",
  "Who is the quarterback for Dallas?",
  "Who has the most RBIs",
  "Who won the NBA finals?",
  "Where is Wrigley Field?",
  "How many regular-season games does each NBA team play?",
  "When is the LA Galaxy's next home game?",
  "Who do the Chicago Cubs play on September 21?", // 21 needs to merge with September
  "When does the football season start?",
  "What hockey teams play today?",
  "Did the Chicago cubs win on Thursday?",
  // Entertainment
  "Play Third Eye Blind's new album",
  "Play more like this",
  "Play the number one song right now", // Needs help with noun grouping tag accuracy
  "What song is playing right now?", // right now is problematic
  "What movies are playing today?",
  "Where is Unbroken playing around here?", // playing around here is problematic
  "I like this song",
  "What are some PG movies playing this afternoon",
  "Who sings this?", // tags are all wrong, heuristics don't help it
  "I want to hear the live version of this song",
  "Play only songs by Nicki Minaj",
  "What won best picture in 2000?",
  "How are the ratings for The Boxtrolls?",
  "Who directed A Perfect World?",
  "Do people like The Theory of Everything?",
  // Out and about (aka Foursquare queries)
  "Where is a good Indian place around here?", // "place around here" is tagged wrong, heuristics don't help
  "I am running low on gas",
  "What time does Whole Foods close?",
  "Give me public transit direction to the De Young Museum", // Public is tagged a verb
  "Where is a good inexpensive place to eat around here?", // "To eat aroung here" is not recognized
  "Make a reservation at a romantic restaurant tonight at 7PM",
  "Find a happy hour nearby", // nearby should be an adverb?
  "Find coffee near me",
  "What planes are flying above me?", // Tags are all wrong: planes is a verb, flying is an adverb
  "I need some aspirin",
  "How are the reviews for Long Bridge Pizza in San Francisco?",
  "Where is a good hair salon?",
  "What's the best retaurant in San Francisco?",
  "I need a good electrician",
  "Where am I?",
  "What is my ETA?",
  // Homekit
  "Turn the lights blue",
  "Turn off the radio", // "off" should be a particle
  "Turn off the printer in the office", // "off" should be a particle
  "Lock the front door", // front is classified a noun, should be an adhective
  "Set the brightness of the downstairs lights to 50%",
  "Set the Tahoe house to 72 degrees", // house is a verb
  "Turn off Chloe's light", // "off" should be a particle
  "Turn the living room lights all the way up", // lights is a verb
  "Turn on the bathroom heater",
  // Getting answers
  "Do I need an umbrella today?",
  "How is the Nikkei doing?",
  "When is daylight saving time?",
  "What is the definition of pragmatic?", // "pragmatic is an adjective"
  "What's the latest in San Francisco?",
  "Did the groundhog see its shadow?",
  "When is sunset in Paris", // sunset should be a noun
  "What is the population of Jamaica?",
  "What is the square root of 128?",
  "What is 40 degrees Farenheit in Celsius", // Here is an example where the proper noun combining heuristic fails
  "What is the temperature outside?", // outside is a preposition
  "What time is it in Berlin",
  "When was Abraham Lincoln born?", // This will get Abraham Lincoln, but we need to use "when" and "born" to figure out a date is expected
  "Show me the Orion constellation",
  "What's the high for Anchorage on Thursday?", // This breaks noun combining heuristic
  "How many dollars is 45 Euros",
  "What day is it?",
  "How many calories in a bagel?",
  "What is Apple's P/E ratio?",
  "Compare AAPL and NASDAQ",
  "How humid is it in New York right now", // Heuristics mess up tagging, "is" is a noun in order to use "humid" as an adjective
  "What's an 18% tip on $85?",
  "What is the UV index outside?",
  "How many cups in a liter",
  "Is it going to snow next week?",
];
*/
app.init("nlqp", function () {
    console.log("Running " + phrases.length + " tests...");
    console.log("===========================================================================================");
    var queryStates = phrases.map(function (phrase) { return parseTest(phrase, n); });
    var complete = queryStates.filter(function (state) { return state === nlqp.StateFlags.COMPLETE; }).length;
    var moreinfo = queryStates.filter(function (state) { return state === nlqp.StateFlags.MOREINFO; }).length;
    var noresult = queryStates.filter(function (state) { return state === nlqp.StateFlags.NORESULT; }).length;
    console.log("===========================================================================================");
    console.log("Total Queries: " + phrases.length + " | Complete: " + complete + " | MoreInfo: " + moreinfo + " | NoResult: " + noresult);
    console.log("===========================================================================================");
});
//# sourceMappingURL=NLQPTest.js.map