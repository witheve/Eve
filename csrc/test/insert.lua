x = generate_uuid()
insert(x, "color", "blue")
insert(x, "length", 2.8)
insert(x, "tag", "watermelonkid")

-- scan takes an input bitmap over eavbtu (e is lsb)
-- and output bitmap over eavbtu (e is lsb)

-- how do we distinguish registers from value constants?

run(scan(wrap_tail(function(op, r)
                   print(value_to_string(r[1]), " ",
                         value_to_string(r[2]), " ",
                         value_to_string(r[3]))
                   end),
            "EAV",
            register(0),        
            register(1),
            register(2)))    
