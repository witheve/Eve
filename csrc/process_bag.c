#include <runtime.h>

// do we really need this? i mean eventually for reflection purposes
typedef struct process {
    heap h;
    evaluation ev;
    table scopes;
    table persisted;
} *process;

struct process_bag{
    struct bag b;
    heap h;
    table processes;
    multibag persisted;
};

evaluation process_resolve(process_bag pb, uuid e)
{
    process p;
    if ((p = table_find(pb->processes, e))) {
        return p->ev;
    }
    return 0;
}

static CONTINUATION_1_5(process_bag_insert, process_bag, value, value, value, multiplicity, uuid);
static void process_bag_insert(process_bag f, value e, value a, value v, multiplicity m, uuid bku)
{
}

static CONTINUATION_1_5(process_bag_scan, process_bag, int, listener, value, value, value);
static void process_bag_scan(process_bag fb, int sig, listener out, value e, value a, value v)
{
}

CONTINUATION_1_1(process_bag_commit, process_bag, edb)
void process_bag_commit(process_bag pb, edb s)
{
    edb_foreach_e(s, e, sym(tag), sym(process), m) {
        heap h = allocate_rolling(pages, sstring("process"));
        process p = allocate(h, sizeof(struct process));
        p->scopes = create_value_table(h);
        p->persisted = pb->persisted;
        p->h = h;
        table_set(pb->processes, e, p);
    }

        // scopes is a bag, which we're going to ...upgrade to a bag bag
    edb_foreach_ev(s, e, sym(scope), descriptor, m) {
        process p;
        // xx - handle default read and write
        if ((p = table_find(pb->processes, e))){
            edb_foreach_av(s, descriptor, name, bag, m)
                table_set(p->scopes, name, bag);
        } else {
            prf("No process found for %v scopes\n", e);
        }
    }

    edb_foreach_ev(s, e, sym(source), v, m) {
        process p = table_find(pb->processes, e);
        if(p) {
            estring source = v;
            bag compiler_bag;
            vector n = compile_eve(p->h,
                                   alloca_wrap_buffer(source->body, source->length),
                                   false, &compiler_bag);
            p->ev = build_evaluation(p->h, p->scopes, p->persisted, ignore, ignore, n);
        }
        prf("No process found for %v source\n", e);
    }

}


// not sure if bag is the right model for presenting this interface, but it can be changed
process_bag process_bag_init(multibag persisted)
{
    heap h = allocate_rolling(init, sstring("process_bag"));
    process_bag pb = allocate(h, sizeof(struct process_bag));
    pb->h = h;
    pb->b.insert = cont(h, process_bag_insert, pb);
    pb->b.scan = cont(h, process_bag_scan, pb);
    pb->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    pb->b.commit = cont(h, process_bag_commit, pb);
    pb->processes = create_value_table(h);
    pb->persisted = persisted;
    return pb;
}
