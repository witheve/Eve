# [] denotes a field
[] is a person

# :.* denotes a variable
[:person] is a person
[:person] is named [:name] is [:age] years old

# + is an add, non variable things in a field are values
+ [chris] is married to [gloria]

# filtering is done by using a field in a value
[chris] is married to [:spouse]

# lines not separated by a newline are a query? queries can add
# using variables
[me] is friends with [:friend]
[me] lives at [] [] [] [:zip]
[:friend] lives at [] [] [] [:zip]
+ [:friend] lives in my zip code

# primitives are the same
[:a] + [:b] = [:result]

# a possible style for aggregates?
count([:friend] lives in my zip code)

[:department] is headed by [:head]
count([:employee] is in [:department] and makes [:salary])

# TODO sorting? limiting? explicit grouping?

+ chris | is pals with | joe
+ chris | lives at | _ _ _ 94105
+ joe | lives at | _ _ _ 94105

? chris | is friends with | [:friend]
    ? {} met at [:time]
    ? [:time] < [5]
? chris | lives at | [] [] [] [:zip]
? [:friend] | lives at | [] [] [] [:zip]
    ? {} was added at [:time]
+ [:friend] lives in my zip code

count( [] lives in my zip )
