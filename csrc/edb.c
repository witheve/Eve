#include <runtime.h>
#include <unistd.h>
#include <stdio.h>

struct bag {
    table listeners;
    table eav;
    table ave;
    uuid u;
    int count;
    table implications;
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

int edb_size(bag b)
{
    return b->count;
}

uuid edb_uuid(bag b)
{
    return b->u;
}

table edb_implications(bag b)
{
    return(b->implications);
}

void edb_register_implication(bag b, node n)
{
    table_set(b->implications, n, n);
}

void edb_remove_implication(bag b, node n)
{
    table_set(b->implications, n, 0);
}

void edb_scan(bag b, int sig, void *f, value e, value a, value v)
{
    // we can share further
    switch (sig) {
    case s_eav:
        table_foreach(b->eav, e, al) {
            table_foreach(((table)al), a, vl) {
                table_foreach((table)vl, v, count) {
                    if(count > 0) {
                        apply((three_listener)f, e, a, v, etrue);
                    }
                }
            }
        }
        break;

    case s_EAV:
        {
            table al = table_find(b->eav, e);
            if(al) {
                table vl = table_find(al, a);
                if(vl) {
                    if (table_find(vl, v) > 0){
                        apply((zero_listener)f, etrue);
                    }
                }
            }
            break;
        }

    case s_EAv:
        {
            table al = table_find(b->eav, e);
            if(al) {
                table vl = table_find(al, a);
                if(vl) {
                    table_foreach(vl, v, count) {
                        if(count > 0) {
                            apply((one_listener)f, v, etrue);
                        }
                    }
                }
            }
            break;
        }

    case s_Eav:
        {
            table al = table_find(b->eav, e);
            if(al) {
                table_foreach(al, a, vl) {
                    table_foreach((table)vl, v, count) {
                        if(count) {
                            apply((two_listener)f, a, v, etrue);
                        }
                    }
                }
            }
            break;
        }

    case s_eAV:
        {
            table al = table_find(b->ave, a);
            if(al) {
                table vl = table_find(al, v);
                if(vl) {
                    table_foreach(vl, e, count) {
                        if(count) {
                            apply((one_listener)f, e, etrue);
                        }
                    }
                }
            }
            break;
        }
    default:
        prf("unknown scan signature:%x\n", sig);
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
bag create_bag(uuid u)
{
    heap h = allocate_rolling(pages);
    bag b = allocate(h, sizeof(struct bag));
    b->h = h;
    b->u = u;
    b->eav = create_value_table(h);
    b->ave = create_value_table(h);
    b->implications = allocate_table(h, key_from_pointer, compare_pointer);
    return b;
}

void edb_insert(bag b, value e, value a, value v)
{
    // EAV
    {
        table el = level_fetch(b->h, b->eav, e);
        table al = level_fetch(b->h, el, a);
        table tail = level_fetch(b->h, al, v);
        long cur = (long)table_find(tail, v);
        if(!cur) {
            table_set(tail, v, (void *)1);
        } else {
            table_set(tail, v, (void *)(cur + 1));
        }
    }

    // AVE
    {
        table al = level_fetch(b->h, b->ave, a);
        table vl = level_fetch(b->h, al, v);
        table tail = level_fetch(b->h, vl, e);
        long cur = (long)table_find(tail, v);
        if(!cur) {
            table_set(tail, v, (void *)1);
        } else {
            table_set(tail, v, (void *)(cur + 1));
        }
    }
    b->count++;
}

int buffer_unicode_length(buffer buf)
{
    int length = 0;
    rune_foreach(buf, c) {
        length++;
    }
    return length;
}

string bag_dump(heap h, bag b)
{

    buffer out = allocate_string(h);
    table_foreach(b->eav, e, avl) {
        int start = buffer_unicode_length(out);
        bprintf(out, "%v ", e);

        int ind = buffer_unicode_length(out)-start;
        int first =0;

        table_foreach((table)avl, a, vl) {
            int second = 0;
            int start = buffer_unicode_length(out);
            bprintf(out, "%S%v ", first++?ind:0, a);
            int ind2 = buffer_unicode_length(out)-start;
            table_foreach((table)vl, v, _)
                bprintf(out, "%S%v\n", second++?ind2:0, v);
        }
    }
    return out;
}


void edb_remove(bag b, value e, value a, value v)
{
    // EAV
    {
        table el = table_find(b->eav, e);
        if(el) {
            table al = table_find(el, a);
            if(al) {
                table tail = table_find(al, v);
                if(tail) {
                    long cur = (long)table_find(tail, v);
                    if(!cur) {
                        table_set(tail, v, (void *)-1);
                    } else {
                        table_set(tail, v, (void *)(cur - 1));
                    }
                }
            }
        }
    }

    // AVE
    {
        table al = table_find(b->ave, a);
        if(al) {
            table vl = table_find(al, v);
            if(vl) {
                table tail = table_find(vl, e);
                if(tail) {
                    long cur = (long)table_find(tail, e);
                    if(!cur) {
                        table_set(tail, e, (void *)-1);
                    } else {
                        table_set(tail, e, (void *)(cur - 1));
                    }
                }
            }
        }
    }
    b->count++;
}

void edb_set(bag b, value e, value a, value v)
{
    // remove all the current values
    table el = level_fetch(b->h, b->eav, e);
    table al = level_fetch(b->h, el, a);
    table tail = level_fetch(b->h, al, v);
    table_foreach(tail, v, count) {
        edb_remove(b, e, a, v);
    }
    // insert the new value
    edb_insert(b, e, a, v);
}
