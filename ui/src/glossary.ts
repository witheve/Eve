module glossary {

    export var terms = [
      {term: "Relationship",
       description: "Relationships are tables in the system."},
      {term: "Attribute",
       description: "Attributes are the fields of a table."},
      {term: "Select",
       description: "By selecting an attribute you are choosing to have that attribute show up in the result of your query"},
      {term: "Unselect",
       description: "Unselecting an attribute removes that attribute from your query. Doing so can have a dramatic impact on your results as Eve automatically collapses duplicates. For example if you have query that selects parts and their colors, if you removed the part and left only the color, your result would only contain one row for each unique color."},
      {term: "Filter",
       description: "A filter is applied to an attribute and reduces the results to those where the attribute is equal to the given value."},
    ];

}