#include <runtime.h>
#include <unistd.h>

typedef struct level {
    table lookup;
    table listeners;
} *level;


struct bag {
    table listeners;
    level eav;
    level ave;
    value uuid;
    heap h;
};

static level create_level(heap h)
{
    level x = allocate(h, sizeof(struct level));
    x->lookup = create_value_table(h);
    // should be a pointer comparison and key function
    x->listeners = allocate_table(h, key_from_pointer, compare_pointer);
    return x;
}


// ok, we're going to assume that if there is a miss here we should create the
// next level, since at the very minimum we're going to want to register
// a listener for regularity. sadly, at this moment this means that
// the leaves will end up with a quite useless and empty table
// allocation for the non-existent subsequent level..so it should take creator
level scan(heap h, level lev, value key)
{
    // xxx - thread safety across the read/write - should keep a list of rejected raceos too
    level x = table_find(lev->lookup, key);
    if (!x)  {
        x = create_level(h);
        table_set(lev->lookup, key, x);
    }
    return x;
}

void full_scan(bag b, three_listener f)
{
    // add listener
    foreach_table(b->eav->lookup, e, avl) {
        foreach_table(((level)avl)->lookup, a, vl) {
            foreach_table(((level)vl)->lookup, v, vl) {
                apply(f, e, a, v, etrue);
            }
        }
    }
}

void eav_scan(bag b, value e, value a, value v, zero_listener f)
{
    level al = scan(b->h, b->eav, e);
    level vl = scan(b->h, al, a);
    if (table_elements(vl->lookup) > 0)
        apply(f, etrue);
}

void ea_scan(bag b, value e, value a, one_listener f)
{
    level al = scan(b->h, b->eav, e);
    level vl = scan(b->h, al, a);

    // add listener
    foreach_table(((level)vl)->lookup, v, vl) {
        apply(f, v, etrue);
    }
}

void e_scan(bag b, value e, two_listener f)
{
    level al = scan(b->h, b->eav, e);
    
    // add listener
    foreach_table(al->lookup, a, vl) {
        foreach_table(((level)vl)->lookup, v, vl) {
            apply(f, a, v, etrue);
        }
    }
}

void av_scan(bag b, value a, value v, one_listener f)
{
    level al = scan(b->h, b->ave, a);
    level vl = scan(b->h, al, v);

    // add listener
    foreach_table(((level)vl)->lookup, e, el) {
        apply(f, e, etrue);
    }
}

// its probably going to be better to keep a global guy with
// reference counts because of the object sharing, but this is
// ok for today
bag create_bag(value bag_id) 
{
    heap h = allocate_rolling(pages);
    bag b = allocate(h, sizeof(struct bag));
    b->h = h ;
    b->eav = create_level(h);
    b->ave = create_level(h);
    b->listeners = allocate_table(h, key_from_pointer, compare_pointer);

    return b;
}

void edb_insert(bag b, value e, value a, value v)
{
    // EAV
    {
        level el = scan(b->h, b->eav, e);
        level al = scan(b->h, el, a);
        level tail = scan(b->h, al, v);
        
        // incremental needs to deal with remove
        foreach_table(b->listeners, k, v) {
            apply((three_listener)k, e, a, v, etrue);
        }
        foreach_table(el->listeners, k, v) {
            apply((two_listener)k, a, v, etrue);
        }
        foreach_table(al->listeners, k, v) {
            apply((one_listener)k, v, etrue);
        }
        foreach_table(tail->listeners, k, v) {
            apply((zero_listener)k, etrue);
        }
    }

    // AVE
    {
        level al = scan(b->h, b->ave, a);
        level vl = scan(b->h, al, v);
        level tail = scan(b->h, vl, e);
        
        // incremental needs to deal with remove
        foreach_table(b->listeners, k, v) {
            apply((three_listener)k, e, a, v, etrue);
        }
        foreach_table(al->listeners, k, v) {
            apply((two_listener)k, a, v, etrue);
        }
        foreach_table(vl->listeners, k, v) {
            apply((one_listener)k, v, etrue);
        }
        foreach_table(tail->listeners, k, v) {
            apply((zero_listener)k, etrue);
        }
    }
}


static void indent(buffer out, int x)
{
    for (int i= 0; i< x; i++)
        buffer_write_byte(out, ' ');
}

static void value_print(buffer out, value v)
{
    switch(type_of(v)) {
    case uuid_space:
        bprintf(out , "%X", wrap_buffer(init, v, UUID_LENGTH));
        break;
        //    case float_space:
        //        break;
    case interned_space:
        {
            string_intermediate si = v;
            bprintf(out , "\"");
            buffer_append(out, si->body, si->length);
            bprintf(out , "\"");
        }
        break;
    default:
        write (1, "wth!@\n", 6);
    }
    
}

string bag_dump(heap h, bag b) 
{
    buffer out = allocate_string(h);
    foreach_table(b->eav->lookup, e, avl) {
        int start = buffer_length(out);
        int afirst = 0;
        value_print(out, e);
        indent(out, 1);
        int ind = buffer_length(out)-start;
        
        foreach_table(((level)avl)->lookup, a, vl) {
            int start = buffer_length(out);
            int vfirst = 0;
            if (afirst++) indent(out, ind);
            value_print(out, a);
            indent(out, 1);
            int ind2 = ind+buffer_length(out)-start;
            foreach_table(((level)vl)->lookup, v, vl) {
                if (vfirst++) indent(out, ind2);
                value_print(out, v);
                buffer_write_byte(out, '\n');
            }
        }
    }
    return out;
}

void edb_remove(bag b, value e, value a, value v)
{
    error("but we went to so much trouble!\n");
}


