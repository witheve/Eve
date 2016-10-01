#include <runtime.h>

static CONTINUATION_1_5(debug_bag_insert, evaluation, value, value, value, multiplicity, uuid);
static void debug_bag_insert(evaluation ev, value e, value a, value v, multiplicity m, uuid bku)
{
}

static CONTINUATION_1_1(debug_bag_commit, evaluation, edb)
static void debug_bag_commit(evaluation ev, edb s)
{
    prf("[DEBUG] commit:\n%b\n", edb_dump(ev->working, s));
}

CONTINUATION_1_5(debug_bag_scan, evaluation, int, listener, value, value, value);
void debug_bag_scan(evaluation ev, int sig, listener out, value e, value a, value v)
{
}

bag init_debug_bag(evaluation ev)
{
    bag b = allocate(ev->h, sizeof(struct bag));
    b->insert = cont(ev->h, debug_bag_insert, ev);
    b->scan = cont(ev->h, debug_bag_scan, ev);
    b->commit = cont(ev->h, debug_bag_commit, ev);
    b->listeners = allocate_table(ev->h, key_from_pointer, compare_pointer);
    b->blocks = allocate_vector(ev->h, 1);
    b->block_listeners = allocate_table(ev->h, key_from_pointer, compare_pointer);
    return b;
}
