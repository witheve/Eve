add some people to the organization
  update
    karen = [#employee @karen]
    jill = [#employee @jill boss: karen]
    deena = [#employee @joe boss: jill]
    ed = [#employee @ed boss: deena]
    joe = [#employee @joe boss: jill]
    gram = [#employee @gram boss: joe]

get the people at the top
  top = [#employee not(boss)]
  update
    top.level := 0

figure out org chart depth
  employee = [#employee boss: [level]]
  update
    employee.level := level + 1

