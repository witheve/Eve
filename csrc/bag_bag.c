#include <runtime.h>

static CONTINUATION_1_5(bagbag_insert, evaluation, value, value, value, multiplicity, uuid);
static void bagbag_insert(evaluation ev, value e, value a, value v, multiplicity m, uuid bku)
{
}

static CONTINUATION_1_1(bagbag_commit, evaluation, edb)
static void bagbag_commit(evaluation ev, edb s)
{
    edb_foreach_e(s, e, sym(tag), sym(bag), m) {
        bag b = (bag)create_edb(ev->h, 0);
        table_set(ev->t_input, e, b);
    }

    edb_foreach_ev(s, e, sym(bags), v, m) {
        // we're going to silent refuse to bind fruits into the bag namespace?
        // maybe this map should be raw eavs?
        bag b;
        if (table_find(ev->t_input, e)) {
            table_set(ev->scopes, v, e);
        }
    }
}


CONTINUATION_1_5(bagbag_scan, evaluation, int, listener, value, value, value);
void bagbag_scan(evaluation ev, int sig, listener out, value e, value a, value v)
{
    if (sig & e_sig) {
    }
    if (sig & a_sig) {
    }
    if (sig & v_sig) {
    }
}

bag init_bag_bag(evaluation ev)
{
    bag b = allocate(ev->h, sizeof(struct bag));
    b->insert = cont(ev->h, bagbag_insert, ev);
    b->scan = cont(ev->h, bagbag_scan, ev);
    b->commit = cont(ev->h, bagbag_commit, ev);
    b->listeners = allocate_table(ev->h, key_from_pointer, compare_pointer);
    return b;
}
