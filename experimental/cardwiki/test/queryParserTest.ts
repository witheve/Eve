import * as app from "../src/app";
//import {root} from "../src/queryParser";
import {Step, StepType, queryToPlan, Plan, Validated, TokenTypes, RelationshipTypes} from "../src/queryParser";
import "../src/wiki";
app.renderRoots["wiki"] = root;

interface TestQuery {
  query: string;
  expected: Step[];
  shouldFail?: boolean;
}

var tests: TestQuery[] = [
  {
    query: "chris granger's age",
    expected: [
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"}
    ],
  },
  {
    query: "robert attorri's age",
    expected: [
      {type: StepType.FIND, subject: "robert attorri"},
      {type: StepType.LOOKUP, subject: "age"}
    ]
  },
  {
    query: "people older than chris granger",
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: ">", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },
  { 
    query: "people whose age < 30",
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {subject: "30"}
      ]}
    ]
  },
  {
    query: "people whose age < chris granger's age",
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },
  {
    query: "people whose age < chris granger's",
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FIND, subject: "chris granger"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.FILTER, subject: "<", args: [
        {parent: "person", subject: "age"},
        {parent: "chris granger", subject: "age"}
      ]}
    ]
  },
  {
    query: "people older than chris granger and younger than edward norton",
    expected: [
      {type: StepType.GATHER, subject: "person"},
      {type: StepType.LOOKUP, subject: "age"},
    ],
  },
  {
    query: "people between 50 and 65 years old",
    expected: [],
  },
  {
    query: "people whose age is between 50 and 65",
    expected: [],
  },
  {
    query: "people who are 50-65 years old",
    expected: [],
  },
  {
    query: "people older than chris granger's spouse",
    expected: [],
  },
  {
    query: "people older than their spouse",
    expected: [],
  },
  {
    query: "people who are either heads or spouses of heads",
    expected: [],
  },
  {
    query: "people who have a hair color of red or black",
    expected: [],
  },
  {
    query: "people who have neither attended a meeting nor had a one-on-one",
    expected: [],
  },
  {
    query: "salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"}
    ]
  },
  {
    query: "salaries per department and age",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.GROUP, subject: "age"}
    ]
  },
  {
    query: "salaries per department, employee, and age",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.LOOKUP, subject: "age"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.GROUP, subject: "employee"},
      {type: StepType.GROUP, subject: "age"}
    ]
  },
  {
    query: "sum of the salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.AGGREGATE, subject: "sum", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  {
    query: "average of the salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.AGGREGATE, subject: "average", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  {
    query: "top 2 employee salaries",
    expected: [
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.SORT, subject: "results", direction: "descending", field: {parent: "employee", subject: "salary"} },
      {type: StepType.LIMIT, subject: "results", value: "2"},
    ]
  },
  {
    query: "top 2 salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.SORT, subject: "per group", direction: "descending", field: {parent: "department", subject: "salary"} },
      {type: StepType.LIMIT, subject: "per group", value: "2"},
    ]
  },
  {
    query: "sum of the top 2 salaries per department",
    expected: [
      {type: StepType.GATHER, subject: "department"},
      {type: StepType.GATHER, subject: "employee"},
      {type: StepType.LOOKUP, subject: "salary"},
      {type: StepType.GROUP, subject: "department"},
      {type: StepType.SORT, subject: "per group", direction: "descending", field: {parent: "department", subject: "salary"} },
      {type: StepType.LIMIT, subject: "per group", value: "2"},
      {type: StepType.AGGREGATE, subject: "sum", args: [
        {parent: "department", subject: "salary"}
      ]}
    ]
  },
  { 
    query: "top 2 salaries of the first 3 departments",
    expected: [],
  },
  {
    query: "departments where all the employees are male",
    expected: [],
  },
  {
    query: "departments where all the employees are over-40 males",
    expected: [],
  },
  {
    query: "employees whose sales are greater than their salary",
    expected: [],
  },
  {
    query: "count employees and their spouses",
    expected: [],
  },
  {
    query: "dishes with eggs and chicken",
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg"},
      {type: StepType.FILTERBYENTITY, subject: "chicken"}
    ]
  },
  {
    query: "dishes with eggs or chicken",
    expected: [],
  },
  {
    query: "dishes without eggs and chicken",
    expected: [],
  },
  {
    query: "dishes without eggs or chicken",
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg", deselected: true},
      {type: StepType.FILTERBYENTITY, subject: "chicken", deselected: true}
    ]
  },
  {
    query: "dishes with eggs that aren't desserts",
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg"},
      {type: StepType.INTERSECT, subject: "dessert", deselected: true}
    ]
  },
  {
    query: "dishes that don't have eggs or chicken",
    expected: [
      {type: StepType.GATHER, subject: "dish"},
      {type: StepType.FILTERBYENTITY, subject: "egg", deselected: true},
      {type: StepType.FILTERBYENTITY, subject: "chicken", deselected: true}
    ]
  },
  {
    query: "dishes with a cook time < 30 that have eggs and are sweet",
    expected: [],
  },
  {
    query: "dishes that take 30 minutes to an hour",
    expected: [],
  },
  {
    query: "dishes that take 30-60 minutes",
    expected: [],
  },
  {
    query: "people who live alone",
    expected: [],
  },
  {
    query: "everyone in this room speaks at least two languages",
    expected: [],
  },
  {
    query: "at least two languages are spoken by everyone in this room",
    expected: [],
  },
  {
    query: "friends older than the average age of people with pets",
    expected: [],
  },
  { 
    query: "meetings john was in in the last 10 days",
    expected: [],
  },
  {
    query: "parts that have a color of \"red\", \"green\", \"blue\", or \"yellow\"",
    expected: [],
  },
  {
    query: "per book get the average price of books(2) that are cheaper",
    expected: [],
  },
  {
    query: "per book get the average price of books(2) that cost less",
    expected: [],
  },
  {
    query: "per book get the average price of books(2) where books(2) price < book price",
    expected: [],
  },
  {
    query: "head's last name = employee's last name and head != employee and head's department = employee's department",
    expected: [],
  },
  {
    query: "person loves person(2) and person(2) loves person(3) and person(3) loves person",
    expected: [],
  },
  {
    query: "employee salary / employee's department total cost ",
    expected: [],
  },
  {
    query: "Return the average number of publications by Bob in each year",
    expected: [],
  },
  {
    query: "Return authors who have more papers than Bob in VLDB after 2000",
    expected: [],
  },
  {
    query: "Return the conference in each area whose papers have the most total citations",
    expected: [],
  },
  {
    query: "return all conferences in the database area",
    expected: [],
  },
  {
    query: "return all the organizations, where the number of papers by the organization is more than the number of authors in IBM",
    expected: [],
  },
  {
    query: "return all the authors, where the number of papers by the author in VLDB is more than the number of papers in ICDE",
    expected: [],
  },
  {
    query: "Where are the restaurants in San Francisco that serve good French food?",
    expected: [],
  },
  {
    query: "What are the population sizes of cities that are located in California?",
    expected: [],
  },
  {
    query: "What are the names of rivers in the state that has the largest city in the united states of america?",
    expected: [],
  },
  {
    query: "What is the average elevation of the highest points in each state?",
    expected: [],
  },
  {
    query: "What jobs as a senior software developer are available in houston but not san antonio?",
    expected: [],
  },
];

//---------------------------------------------------------
// Validate queries
//---------------------------------------------------------

// Test the actualStep and expectedStep for equivalence
function validateStep(actualStep, expectedStep) : boolean {
  if(actualStep === undefined || actualStep.type !== expectedStep.type || actualStep.subject !== expectedStep.subject || actualStep.deselected !== expectedStep.deselected) {
    return false;
  }
  // Compare args
  if(expectedStep.args !== undefined) {
    let ix = 0;
    for(let exArg of expectedStep.args) {
      if(actualStep.argArray === undefined) {
        return false;
      }
      let arg = actualStep.argArray[ix];
      if(arg.found !== exArg.subject) {
        return false;
      }
      if(exArg.parent && (!arg.parent || arg.parent.found !== exArg.parent)) {
        return false;
      }
      ix++
    }
  }
  // Compare fields
  if((expectedStep.field !== undefined && actualStep.field !== undefined) &&
     (actualStep.field.parent !== expectedStep.field.parent || actualStep.field.subject !== expectedStep.field.subject)) {
    return false;
  }
  // Compare values
  if((expectedStep.value !== undefined && actualStep.value !== undefined) &&
     (actualStep.value !== expectedStep.value)) {
    return false;
  }
  return true;
}

// Test the actual plan and expected plan for equivalence.
// Equivelence here means the expected and actual plans have the same
// steps. Order of steps does not matter.
// Doesn't return anything, adds a `valid` member to the plan and each step
// indicating its validitity state
function validatePlan(actualPlan: Plan, expectedPlan: Step[]) {
  
  let expectedPlanLength = expectedPlan.length;
  
  // Mark all steps as Unvalidated
  actualPlan.map((step) => step.valid = Validated.UNVALIDATED);
  
  // If no expected plan is provided, we cannot validate any steps
  if(expectedPlan.length === 0) {
    actualPlan.valid = Validated.UNVALIDATED;
    return;
  } 
  
  // Loop through the steps of the actual plan and test it against candidate steps.
  // When a match is found, remove it from the canditate steps. Continue until all
  // actual steps are validated.
  // @HACK: this is not entirely correct. We still need to check that the step is
  // attached to the correct root
  let invalidSteps = actualPlan.length;
  for(let actualStep of actualPlan) {
    for(let ix in expectedPlan) {
      if(validateStep(actualStep,expectedPlan[ix])) {
        actualStep.valid = Validated.VALID;
        invalidSteps--;
        expectedPlan.splice(ix,1);
        break;
      }
      actualStep.valid = Validated.INVALID;
    }
  }
  let consumedPlanSteps = expectedPlanLength - expectedPlan.length;
  
  // If every expected step is consumed, and all found steps are valid, the plan is valid
  if(consumedPlanSteps === expectedPlanLength && invalidSteps === 0) {
    actualPlan.valid = Validated.VALID;
  } else {
    actualPlan.valid = Validated.INVALID;
  }
}

//---------------------------------------------------------
// Debug drawing
//---------------------------------------------------------

function groupTree(root) {
  if(root.type === TokenTypes.TEXT) return;
  let kids = root.children.map(groupTree);
  let relationship = "root";
  let unfound = "";
  let distance = "";
  let nodes = "";
  if(root.relationship) {
    relationship = RelationshipTypes[root.relationship.type];
    unfound = root.relationship.unfound ? " (unfound)" : unfound;
    distance = ` (${root.relationship.distance})`;
    if(root.relationship.nodes && root.relationship.nodes.length) {
      nodes = ` (${root.relationship.nodes.map((nodes) => nodes[0]).join(", ")})`;
    }
  }

  return {c: "", children: [
    {c: `node ${TokenTypes[root.type]}`, text: `${root.found} (${relationship})${unfound}${distance}${nodes}`},
    {c: "kids", children: kids},
  ]};
}

function validateTestQuery(test: TestQuery) : any {
  let start = performance.now();
  let {tokens, tree, plan} = queryToPlan(test.query);
  validatePlan(plan, test.expected);
  return { valid: plan.valid, tokens, tree, plan, expectedPlan: test.expected, searchString: test.query, time: performance.now() - start };
}

function queryTestUI(result) {
  let {tokens, tree, plan, expectedPlan, valid, searchString} = result;
  
  //tokens
  let tokensNode = {c: "tokens", children: [
    {c: "header", text: "Tokens"},
    {c: "kids", children: tokens.map((token) => {
      return {c: `node ${TokenTypes[token.type]}`, text: `${token.found} (${TokenTypes[token.type]})`}
    })}
  ]};

  //tree
  let treeNode = {c: "tree", children: [
    {c: "header", text: "Tree"},
    {c: "kids", children: [
      {c: "header2", text: "Roots"},
      {c: "kids", children: tree.roots.map(groupTree)},
      {c: "header2", text: "Operations"},
      {c: "kids", children: tree.operations.map((root) => {
        //console.log(root);
        return {c: "tokens", children: [
          {c: `node ${TokenTypes[root.type]}`, text: `${root.found}`},
          {c: "kids", children: root.args.map((token) => {
            let parent = token.parent ? token.parent.found + "." : "";
            return {c: `node ${TokenTypes[token.type]}`, text: `${parent}${token.found}`}
          })}
        ]};
      })},
      {c: "header2", text: "Groups"},
      {c: "kids", children: tree.groups.map((root) => {
        return {c: `node ${TokenTypes[root.type]}`, text: `${root.found}`};
      })},
    ]}
  ]};


  function StepToDisplay(step) {
    let args = "";
    if(step.argArray) {
      args = " (" + step.argArray.map((arg) => arg.found).join(", ") + ")";
    }
    let deselected = step.deselected ? "!" : "";
    return {c: `step v${step.valid}`, text: `${StepType[step.type]} ${deselected}${step.subject}${args}`};  
  }

  // Format the plan for display
  let planDisplay = plan.map(StepToDisplay);
  let planNode = {c: "tokens", children: [
    {c: "header", text: "Plan"},
    {c: "kids", children: planDisplay}
  ]};
  
  // @TODO Display extra steps
  let extraStepsNode = {};
  if(expectedPlan.length != 0) {
    let unusedPlanDisplay = expectedPlan.map(StepToDisplay);
    extraStepsNode = {c: "tokens", children: [
      {c: "header", text: "Unused Steps"},
      {c: "kids", children: unusedPlanDisplay}
    ]};  
  }

  // The final display for rendering
  return {c: `search v${valid}`, click: toggleQueryResult, children: [
    {c: "search-header", text: `${searchString}`},
    {c: "search-body", children: [
    tokensNode,
    treeNode,
    planNode,
    extraStepsNode,
    {c: "tokens", children: [
      {c: "header", text: "Performance"},
      {c: "kids", children: [
        {c: "time", text: `Total: ${result.time.toFixed(2)}ms`},
      ]}
    ]}
    ]}
  ]};
}

function toggleQueryResult(evt, elem) {

}

export function root() {
  let results = [];
  let resultStats = {unvalidated: 0, succeeded: 0, failed: 0};
  for(let test of tests) {
    let result = validateTestQuery(test);
    results.push(result);
    if(result.valid === Validated.UNVALIDATED) {
      resultStats.unvalidated++;
    } else if(result.valid === Validated.INVALID) {
      resultStats.failed++;
    } else {
      resultStats.succeeded++;
    }
  }
  let resultItems = results.map(queryTestUI);
  let totalParseTime = 0;
  let minParseTime = Infinity;
  let maxParseTime = 0;
  for(let result of results) {
    totalParseTime += result.time;
    if(minParseTime > result.time) minParseTime = result.time;
    if(maxParseTime < result.time) maxParseTime = result.time; 
  }
  let averageParseTime = totalParseTime / results.length;
  return {id: "root", c: "test-root", children: [
    {c: "stats row", children: [
      {c: "failed", text: resultStats.failed},
      {c: "succeeded", text: resultStats.succeeded},
      {c: "unvalidated", text: resultStats.unvalidated},
    ]},
    {c: "perf", text: `min: ${minParseTime.toFixed(2)}ms | max: ${maxParseTime.toFixed(2)}ms | average: ${averageParseTime.toFixed(2)}ms` },    
    {children: resultItems}
  ]};
}