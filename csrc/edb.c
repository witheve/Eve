#include <runtime.h>
#include <unistd.h>

struct bag {
    table listeners;
    table eav;
    table ave;
    value uuid;
    heap h;
};

table level_fetch(heap h, table current, value key) {
    table next_level = table_find(current, key);
    if(!next_level) {
        next_level = create_value_table(h);
        table_set(current, key, next_level);
    }
    return next_level;
}

void full_scan(bag b, three_listener f)
{
    table_foreach(b->eav, e, al) {
        table_foreach(((table)al), a, vl) {
            table_foreach(((table)vl), v, _) {
                apply(f, e, a, v, etrue);
            }
        }
    }
}

void eav_scan(bag b, value e, value a, value v, zero_listener f)
{
    table al = table_find(b->eav, e);
    if(al) {
        table vl = table_find(al, a);
        if(vl) {
            if (table_elements(vl) > 0) {
                apply(f, etrue);
            }
        }
    }
}

void ea_scan(bag b, value e, value a, one_listener f)
{
    table al = table_find(b->eav, e);
    if(al) {
        table vl = table_find(al, a);
        if(vl) {
            table_foreach(vl, v, _) {
                apply(f, v, etrue);
            }
        }
    }
}

void e_scan(bag b, value e, two_listener f)
{
    table al = table_find(b->eav, e);
    if(al) {
        table_foreach(al, a, vl) {
            table_foreach(((table)vl), v, _) {
                apply(f, a, v, etrue);
            }
        }
    }
}

void av_scan(bag b, value a, value v, one_listener f)
{
    table al = table_find(b->ave, a);
    if(al) {
        table vl = table_find(al, v);
        if(vl) {
            table_foreach(vl, e, _) {
                apply(f, e, etrue);
            }
        }
    }
}

// seems like we could scope this for testing purposes
static table bag_table;

void register_bag(uuid x, insertron i)
{
    if (!bag_table) {
        bag_table = allocate_table(init, key_from_pointer, compare_pointer);
    }
    table_set(bag_table, x, i);
}


// its probably going to be better to keep a global guy with
// reference counts because of the object sharing, but this is
// ok for today
bag create_bag()
{
    
    heap h = allocate_rolling(pages);
    bag b = allocate(h, sizeof(struct bag));
    b->h = h;
    b->eav = create_value_table(h);
    b->ave = create_value_table(h);
    return b;
}

void edb_insert(bag b, value e, value a, value v)
{
    // EAV
    {
        table el = level_fetch(b->h, b->eav, e);
        table al = level_fetch(b->h, el, a);
        table tail = level_fetch(b->h, al, v);
    }

    // AVE
    {
        table al = level_fetch(b->h, b->ave, a);
        table vl = level_fetch(b->h, al, v);
        table tail = level_fetch(b->h, vl, e);
    }
}


void multibag_insert(multibag m, uuid u, value e, value a, value v)
{
    bag b;
    if (!(b = table_find(m, u))){
        b = create_bag(m->h);
        table_set(m, u, b);
    }
    edb_insert(b, e, a, v);
}

   
string bag_dump(heap h, bag b)
{
    buffer out = allocate_string(h);
    table_foreach(b->eav, e, avl) {
        int start = buffer_length(out);
        bprintf(out, "%v ", e);
        int ind = buffer_length(out)-start;
        
        table_foreach(((table)avl), a, vl) {
            int start = buffer_length(out);
            bprintf(out, "%S%v ", ind, a);
            int ind2 = ind+buffer_length(out)-start;
            table_foreach(((table)vl), v, _) 
                bprintf(out, "%S%v\n", ind2, v);
        }
    }
    return out;
}


void edb_remove(bag b, value e, value a, value v)
{
    error("but we went to so much trouble!\n");
}

