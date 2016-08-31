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
    edb_foreach_e(s, e, sym(tag), sym(process), v) {
        heap h = allocate_rolling(pages, sstring("process"));
        process p = allocate(h, sizeof(struct process));
        p->scopes = create_value_table(h);
        p->persisted = create_value_table(h);
        p->h = h;
        table_set(pb->processes, e, p);
    }

    edb_foreach_ev(s, e, sym(scopes), v, m) {
        process p;
        if ((p = table_find(pb->processes, e))){
            value name = lookupv(s, v, sym(name));
            table_set(p->scopes, name, v);
            // xxx- sharing - this allocation should come from the bagbag
            table_set(p->persisted, v, create_edb(p->h, 0));
        }
    }

    edb_foreach_ev(s, e, sym(source), v, m) {
        process p;
        estring source = v;
        if ((p = table_find(pb->processes, e))){
            p->ev = build_process(p->h,
                                  wrap_buffer(p->h, source->body, source->length),
                                  false, p->scopes, p->persisted,
                                  ignore, ignore);
        }
    }
}


// not sure if bag is the right model for presenting this interface, but it can be changed
process_bag process_bag_init()
{
    heap h = allocate_rolling(init, sstring("process_bag"));
    process_bag pb = allocate(h, sizeof(struct process_bag));
    pb->h = h;
    pb->b.insert = cont(h, process_bag_insert, pb);
    pb->b.scan = cont(h, process_bag_scan, pb);
    pb->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    pb->b.commit = cont(h, process_bag_commit, pb);
    pb->processes = create_value_table(h);
    return pb;
}
