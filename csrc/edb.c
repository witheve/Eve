#include <runtime.h>
#include <unistd.h>
#include <stdio.h>

table level_fetch(heap h, table current, value key) {
    table next_level = value_table_find(current, key);
    if(!next_level) {
        next_level = create_value_table(h);
        table_set(current, key, next_level);
    }
    return next_level;
}

multiplicity count_of(edb b, value e, value a, value v)
{
    table al = value_table_find(b->eav, e);
    if(al) {
        table vl = value_table_find(al, a);
        if(vl) {
            leaf c = value_table_find(vl, v);
            if (c) return c->m;
        }
    }
    return 0;
}

value lookupv(edb b, uuid e, estring a)
{
    table al = value_table_find(b->eav, e);
    if(al) {
        table vl = value_table_find(al, a);
        if(vl)
            table_foreach(vl, v, terminal)
                if(((leaf)terminal)->m != 0)
                    return v;
    }

    vector_foreach(b->includes, i) {
        value x = lookupv(i, e, a);
        if (x) return x;
    }

    return(0);
}

int edb_size(edb b)
{
    return b->count;
}

static CONTINUATION_1_5(edb_scan, edb, int, listener, value, value, value);
static void edb_scan(edb b, int sig, listener out, value e, value a, value v)
{
    vector_foreach(b->includes, i)
        edb_scan(i, sig, out, e, a, v);

    switch (sig) {
    case s_eav:
        table_foreach(b->eav, e, al) {
            table_foreach((table)al, a, vl) {
                table_foreach((table)vl, v, f) {
                    leaf final = f;
                    apply(out, e, a, v, final->m, final->block_id);
                }
            }
        }
        break;

    case s_EAV:
        {
            table al = value_table_find(b->eav, e);
            if(al) {
                table vl = value_table_find(al, a);
                if(vl) {
                    leaf final;
                    if ((final = value_table_find(vl, v)) != 0){
                        apply(out, e, a, v, final->m, final->block_id);
                    }
                }
            }
            break;
        }

    case s_EAv:
        {
            table al = value_table_find(b->eav, e);
            if(al) {
                table vl = value_table_find(al, a);
                if(vl) {
                    table_foreach(vl, v, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->block_id);
                    }
                }
            }
            break;
        }

    case s_Eav:
        {
            table al = value_table_find(b->eav, e);
            if(al) {
                table_foreach(al, a, vl) {
                    table_foreach((table)vl, v, f){
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->block_id);
                    }
                }
            }
            break;
        }

    case s_eAV:
        {
            table al = value_table_find(b->ave, a);
            if(al) {
                table vl = value_table_find(al, v);
                if(vl) {
                    table_foreach(vl, e, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->block_id);
                    }
                }
            }
            break;
        }

    case s_eAv:
        {
            table al = value_table_find(b->ave, a);
            if(al) {
                table_foreach(al, v, vl) {
                    table_foreach((table)vl, e, f) {
                        leaf final = f;
                        if(final)
                            apply(out, e, a, v, final->m, final->block_id);
                    }
                }
            }
            break;
        }

    default:
        prf("unknown scan signature:%x\n", sig);
    }
}

static CONTINUATION_1_5(edb_scan_sync, edb, int, listener, value, value, value);
static void edb_scan_sync(edb b, int sig, listener out, value e, value a, value v) {
  edb_scan(b, sig, out, e, a, v);
}

static CONTINUATION_1_5(edb_insert, edb, value, value, value, multiplicity, uuid);
static void edb_insert(edb b, value e, value a, value v, multiplicity m, uuid block_id)
{
    leaf final;

    // EAV
    table el = level_fetch(b->h, b->eav, e);
    table al = level_fetch(b->h, el, a);

    if (!(final = value_table_find(al, v))){
        final = allocate(b->h, sizeof(struct leaf));
        final->block_id = block_id;
        final->m = m;
        table_set(al, v, final);

        // AVE
        table aal = level_fetch(b->h, b->ave, a);
        table avl = level_fetch(b->h, aal, v);
        table_set(avl, e, final);
        b->count++;
    } else {
        final->m += m;

        if (!final->m) {
            table_set(al, v, 0);
            table al = level_fetch(b->h, b->ave, a);
            table vl = level_fetch(b->h, al, v);
            table_set(vl, e, 0);
        }
    }
}

static CONTINUATION_1_1(edb_commit, edb, edb);
static void edb_commit(edb b, edb source)
{
    edb_foreach(source, e, a, v, m, block_id)
        edb_insert(b, e, a, v, m, block_id);
}

static int buffer_unicode_length(buffer buf, int start)
{
    int length = 0;
    int limit = buffer_length(buf);
    for (u32 x = start, q;
         (q = utf8_length(*(u32 *)bref(buf, x))),  x<limit;
         x += q) length++;
    return length;
}


edb create_edb(heap h, vector includes)
{
    edb b = allocate(h, sizeof(struct edb));
    b->b.insert = cont(h, edb_insert, b);
    b->b.scan = cont(h, edb_scan, b);
    b->b.scan_sync = cont(h, edb_scan_sync, b);
    //    b->b.u = u;
    b->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    b->b.commit = cont(h, edb_commit, b);
    b->h = h;
    b->count = 0;
    b->eav = create_value_table(h);
    b->ave = create_value_table(h);
    if(includes != 0 ) {
      b->includes = includes;
    } else {
      b->includes = allocate_vector(h, 1);
    }


    return b;
}


string edb_dump(heap h, edb b)
{
    buffer out = allocate_string(h);
    table_foreach(b->eav, e, avl) {
        int start = buffer_length(out);
        bprintf(out, "%v ", e);
        int ind = buffer_unicode_length(out, start);
        int first =0;

        table_foreach((table)avl, a, vl) {
            int second = 0;
            int start = buffer_length(out);
            bprintf(out, "%S%v ", first++?ind:0, a);
            int ind2 = buffer_unicode_length(out, start) + ((first==1)?ind:0);
            table_foreach((table)vl, v, _)
                bprintf(out, "%S%v\n", second++?ind2:0, v);
        }
    }
    return out;
}

edb bag_as_edb(bag b)
{
    return (edb) b;
}
