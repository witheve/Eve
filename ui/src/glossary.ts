module glossary {

    export var terms = [
      {term: "Relationship",
       description: "Relationships are tables in the system."},
      {term: "Attribute",
       description: "Attributes are the fields of a table."},
      {term: "Show",
       description: "Showing an attribute places it in the results of your query"},
      {term: "Hide",
       description: "Hiding an attribute hides that attribute from the results of your query, which can have a dramatic impact on the results as Eve automatically collapses duplicates. For example if you have query that selects parts and their colors, if you removed the part and left only the color, your result would only contain one row for each unique color."},
      {term: "Filter",
       description: "A filter is applied to an attribute and reduces the results to those where the attribute is equal to the given value."},
      {term: "Unfilter",
       description: "Completely remove a filter that is applied to an attribute."},
      {term: "Chunk",
       description: "Chunking a source allows you to get the whole set of rows from a source. This is used when you want to do something with a whole set instead of row by row, like count the number of books you own or sum the salaries of all the employees in a department."},
      {term: "Unchunk",
       description: "Unchunking causes the source to provide each row as opposed to a full set per group."},
      {term: "Group",
       description: "Grouping is used on an attribute of either a chunked source or a source with ordinals. In the case of a chunked source the sets will be broken up by group, e.g. if you had a source chunked source of books and grouped by author, you'd get a row per author and the set of all that author's books. With ordinals, grouping will cause the ordinal to number the items within each group. This allows you to get the top 5 employees in each department, for example, by grouping employees by department."},
      {term: "Ungroup",
       description: "Stop grouping on an attribute so that it is provided as a set instead of unique singular values."},
      {term: "Join",
       description: "Joining attributes filters the rows of the attached sources to only those where the attributes being joined are the same."},
      {term: "Unjoin",
       description: "Remove the constraint that all the joined attributes must be the same, returning them to individual nodes."},
      {term: "Ordinal",
       description: "Sequentially number each row for a given source. This allows you to filter down rows by number, such as getting the 5 highest paid employees or ."},
      {term: "Unordinal",
       description: "Remove the numbering on rows. If you don't need the ordinal, this makes your queries faster."},
      {term: "Negate",
       description: "Negating a source causes anything joined with that source to be removed from the results. You can think of this as checking if something is \"not in\" the set of rows this source has. For example, if you wanted to find all employees who have not taken vacation, you could join the employees source with a negated vacation source."},
      {term: "Unnegate",
       description: "Return the source to producing each row as a result as opposed to removing any rows that join with this source."},
      {term: "Sort",
       description: "Set the sort order for the attributes of this source. Sorting only impacts what order ordinals and aggregates are applied in, to sort the results of your query click on the arrows on the result columns."},
      {term: "Data",
       description: "Create a set of data if you want to input some values into Eve."},
      {term: "Query",
       description: "Create a query if you want to work with your data."},
    ];

    export var lookup = {};
    for(let term of terms) {
      lookup[term.term] = term;
    }
}