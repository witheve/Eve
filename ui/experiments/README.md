## Madlib experiment

You can open the madlib experiment by running the server and going to http://localhost:8080/madlib

Here's the syntax for madlibs:

```
? denotes a hole
?.* is a named hole
?? is a column field, grouped by the blanks that aren't columns
! at the beginning of a madlib negates it
+ at the beginning of a madlib is unioning
```

This will create the _ is friends with _ madlib

```
? is friends with ?
```

You can now add rows to it:

```
chris is friends with rob
chris is friends with joe
```

This will count the total number of friends and stick that in a new madlib

```
?person is friends with ??a
count ??a = ?total
+ ?person has ?total friends
```

You can drag and drop blanks on top of eachother to join them instead of naming your variables. You can also click the chart button and drag blanks onto the charts in order to chart. Charts expect a column in most cases for their values, so make sure to use a ?? for things you want to chart.
