insert("foo", 5.4, true)
insert("bar", 2.8, false)

-- scan takes an input bitmap over eavbtu (e is lsb)
-- and output bitmap over eavbtu (e is lsb)

-- how do we distinguish registers from value constants?

run(scan(0, 7,
            register(0),
            register(1),
            register(2),    
            wrap_tail(function(a)
             print(#a)
            end)))
