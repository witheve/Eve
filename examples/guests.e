count guests coming to the party
  party = [@"my party"]
  union
    guest = [#person]
  and
    [#person spouse]
    guest = spouse
  end
  total = count(guest given guest)
  update
    party.guest-count := total
    party.guest += guest
  end

how many burgers do I need?
  party = [@"my party" guest]
  choose
    guest = #growing-boy
    burgers = 2
  or
    burgers = 1
  end
  total = sum(burgers given burgers, guest)
  update
    party.burgers := total
  end
