typedef table multibag;

#define multibag_foreach(__m, __u, __b)  if(__m) table_foreach(__m, __u, __b)

// should these guys really reconcile their differences
static inline int multibag_count(table m)
{
    int count = 0;
    multibag_foreach(m, u, b)
        count += edb_size(b);
    return count;
}

static inline boolean compare_multibags(multibag a, multibag b)
{
    bag d;
    if (!a != !b) return false; // if one is zero and the other not, not equal
    if (!a) return true;        // both are empty

    table_foreach(a, u, ab) {
        bag bb = table_find(b, u);
        if (!bb) return false;
        if (edb_size((edb)ab) != edb_size((edb)bb))
            return false;

        edb_foreach((edb)ab, e, a, v, c, _) {
            if (count_of((edb)bb, e, a, v) != c) {
                return false;
            }
        }
    }
    return true;
}

static inline void multibag_set(multibag *mb, heap h, uuid u, bag b)
{
    if (!*mb) (*mb) = create_value_table(h);
    table_set(*mb, u, b);
}


static inline void multibag_insert(multibag *mb, heap h, uuid u, value e, value a, value v, multiplicity m, uuid block_id)
{
    bag b;
#if 0
    value ev= v;
    if (type_of(v)==estring_space) {
        estring es = (estring)v;
        if (es->length > 100) ev=sym(...);
    }
    prf("insert: %v %v %v %v\n", u, e, a, ev);
#endif
    if (!*mb) (*mb) = create_value_table(h);
    if (!(b = table_find((*mb), u)))
        table_set(*mb, u, b = (bag)create_edb(h, 0));

    apply(b->insert, e, a, v, m, block_id);
}

static void multibag_print(multibag x)
{
    table_foreach(x, u, b){
        prf("%v:\n", u);
        prf("%b\n", edb_dump(init, (edb)b));
    }
}
