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
            leaf c = table_find(vl, v);
            if (c) return c->m;
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
    table_foreach(vl, v, terminal)
        if(((leaf)terminal)->m != 0)
            return v;
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
    //FIXME: we're leaking the old implications table here, how would we
    //reclaim it?
    b->implications = allocate_table(b->h, key_from_pointer, compare_pointer);
}

void edb_scan(bag b, int sig, listener out, value e, value a, value v)
{
    switch (sig) {
    case s_eav:
        table_foreach(b->eav, e, al) {
            table_foreach((table)al, a, vl) {
                table_foreach((table)vl, v, f) {
                    leaf final = f;
                    apply(out, e, a, v, final->m, final->bku);
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
                    leaf final;
                    if ((final = table_find(vl, v)) != 0){
                        apply(out, e, a, v, final->m, final->bku);
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
                    table_foreach(vl, v, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->bku);
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
                    table_foreach((table)vl, v, f){
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->bku);
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
                    table_foreach(vl, e, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->bku);
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
                    table_foreach((table)vl, e, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->bku);
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
    b->count = 0;
    b->eav = create_value_table(h);
    b->ave = create_value_table(h);
    b->listeners = allocate_table(h, key_from_pointer, compare_pointer);
    b->delta_listeners = allocate_table(h, key_from_pointer, compare_pointer);
    b->implications = allocate_table(h, key_from_pointer, compare_pointer);
    return b;
}

void edb_insert(bag b, value e, value a, value v, multiplicity m, uuid bku)
{
    leaf final;

    // EAV
    table el = level_fetch(b->h, b->eav, e);
    table al = level_fetch(b->h, el, a);

    if (!(final = table_find(al, v))){
        final = allocate(b->h, sizeof(struct leaf));
        final->bku = bku;
        final->m = m;
        table_set(al, v, final);

        // AVE
        table al = level_fetch(b->h, b->ave, a);
        table vl = level_fetch(b->h, al, v);
        table_set(vl, e, final);
        b->count++;
    } else {
        final->m += m;
        if (!final->m){
            table_set(al, v, 0);
            table al = level_fetch(b->h, b->ave, a);
            table vl = level_fetch(b->h, al, v);
            table_set(vl, e, 0);
        }
    }
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
