#include <runtime.h>
#include <unistd.h>
#include <stdio.h>

table level_fetch(heap h, table current, value key) {
    table next_level = table_find(current, key);
    if(!next_level) {
        next_level = create_value_table(h);
        table_set(current, key, next_level);
    }
    return next_level;
}

multiplicity count_of(bag b, value e, value a, value v)
{
    table al = table_find(b->eav, e);
    if(al) {
        table vl = table_find(al, a);
        if(vl) {
            void *c = table_find(vl, v);
            return (multiplicity) c;
        }
    }
    return 0;
}

value lookupv(bag b, uuid e, estring a)
{
    table al = table_find(b->eav, e);
    if(!al) return 0;
    table vl = table_find(al, a);
    if(!vl) return 0;
    table_foreach(vl, v, count) if(count != 0) return v;
    return(0);
}

void register_listener(bag e, thunk t)
{
    table_set(e->listeners, t, (void *)0x1);
}

void deregister_listener(bag e, thunk t)
{
    table_set(e->listeners, t, 0);
}

void register_delta_listener(bag e, thunk t)
{
    table_set(e->delta_listeners, t, (void *)0x1);
}

void deregister_delta_listener(bag e, thunk t)
{
    table_set(e->delta_listeners, t, 0);
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

void edb_clear_implications(bag b)
{
    // TODO: Is this safe? I assume it is since all I'm doing
    // is zeroing the values out which means the table shouldn't
    // resize or anything. Is there some better way of doing this?
    table_foreach(b->implications, node, v) {
        edb_remove_implication(b, node);
    }
}

void edb_scan(bag b, int sig, listener f, value e, value a, value v)
{
    switch (sig) {
    case s_eav:
        table_foreach(b->eav, e, al) {
            table_foreach((table)al, a, vl) {
                table_foreach((table)vl, v, count) {
                    apply(f, e, a, v, (multiplicity)count);
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
                    multiplicity count;
                    if ((count = (multiplicity)table_find(vl, v)) != 0){
                        apply(f, e, a, v, count);
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
                        if(count != 0) {
                            apply(f, e, a, v, (multiplicity)count);
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
                            apply(f, e, a, v, (multiplicity)count);
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
                        apply(f, e, a, v, (multiplicity)count);
                    }
                }
            }
            break;
        }

    case s_eAv:
        {
            table al = table_find(b->ave, a);
            if(al) {
                table_foreach(al, v, vl) {
                    table_foreach((table)vl, e, count) {
                        apply(f, e, a, v,  (multiplicity)count);       
                    }
                }
            }
            break;
        }

    default:
        prf("unknown scan signature:%x\n", sig);
    }
}

bag create_bag(heap h, uuid u)
{
    bag b = allocate(h, sizeof(struct bag));
    b->h = h;
    b->u = u;
    b->eav = create_value_table(h);
    b->ave = create_value_table(h);
    b->listeners = allocate_table(h, key_from_pointer, compare_pointer);
    b->implications = allocate_table(h, key_from_pointer, compare_pointer);
    return b;
}

void edb_insert(bag b, value e, value a, value v, long multiplicity)
{
    // EAV
    {
        table el = level_fetch(b->h, b->eav, e);
        table al = level_fetch(b->h, el, a);
        long cur = (long)table_find(al, v);
        table_set(al, v, (void *)(cur + multiplicity));
    }

    // AVE
    {
        table al = level_fetch(b->h, b->ave, a);
        table vl = level_fetch(b->h, al, v);
        long cur = (long)table_find(vl, e);
        table_set(vl, e, (void *)(cur + multiplicity));
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

