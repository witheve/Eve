#include <runtime.h>

// do we really need this? i mean eventually for reflection purposes
typedef struct process {
    heap h;
    estring name;
    evaluation ev;
    table scopes;
    table persisted;
    vector read, write;
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
    process p;

    edb_foreach_e(s, e, sym(tag), sym(process), m) {
        heap h = allocate_rolling(pages, sstring("process"));
        p = allocate(h, sizeof(struct process));
        p->scopes = create_value_table(h);
        p->name = sym(anonymous);
        p->persisted = create_value_table(h);
        table_foreach(pb->persisted, u, b) 
            table_set(p->persisted, u, b);
        p->read = allocate_vector(h, 3);
        p->write = allocate_vector(h, 5);
        p->h = h;
        table_set(pb->processes, e, p);
    }

    edb_foreach_ev(s, e, sym(scope), descriptor, m) {
        if ((p = table_find(pb->processes, e))){
            edb_foreach_av(s, lookupv(s, descriptor, sym(bags)), name, bag, m) {
                table_set(p->scopes, name, bag);
                if(!table_find(p->persisted, bag)) {
                    // @NOTE: is this the right heap given that it can be used by subprocesses?
                    table_set(p->persisted, bag, create_edb(p->h, 0));
                }
            }
            edb_foreach_v(s, descriptor, sym(read), bag, m)
                vector_insert(p->read, bag);
            edb_foreach_v(s, descriptor, sym(write), bag, m)
                vector_insert(p->write, bag);

        } else {
            prf("No process found for %v scope\n", e);
        }
    }

    // scopes is a bag, which we're going to ...upgrade to a bag bag
    edb_foreach_ev(s, e, sym(name), name, m) {
        // xx - handle default read and write
        if ((p = table_find(pb->processes, e))){
            p->name = name;
        } else {
            prf("No process found for %v name\n", e);
        }
    }

    edb_foreach_ev(s, e, sym(source), v, m) {
        if(p) {
            estring source = v;
            bag compiler_bag;
            vector n = compile_eve(p->h,
                                   alloca_wrap_buffer(source->body, source->length),
                                   false, &compiler_bag);
            p->ev = build_evaluation(p->h, p->name, p->scopes, p->persisted, ignore, ignore, n);
            vector_foreach(p->read, i)
                vector_insert(p->ev->default_scan_scopes, i);
            vector_foreach(p->write, i)
                vector_insert(p->ev->default_insert_scopes, i);
        } else {
            prf("No process found for %v source\n", e);
        }
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
    pb->b.blocks = allocate_vector(h, 1);
    pb->b.block_listeners = allocate_table(h, key_from_pointer, compare_pointer);
    pb->processes = create_value_table(h);
    pb->persisted = persisted;
    return pb;
}
