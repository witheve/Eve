#include <runtime.h>

// should be out of the bag
table implications;

void register_implication(node n)
{
    if (!implications) 
        implications = allocate_table(init, key_from_pointer, compare_pointer); 
    table_set(implications, n, (void *)1);
}

static CONTINUATION_2_4(inserty, table, boolean *, value, value, value, value);
static void inserty(table multibag, boolean *flag, uuid u, value e, value a, value v)
{
    *flag = true;
    bag b;
    if (!(b = table_find(multibag, u))) 
        table_set(multibag, u, b = create_bag());
    edb_insert(b, e, a, v);
}

static CONTINUATION_1_5(merge_scan, table, int, void *, value, value, value);
static void merge_scan(table t, int sig, void *listen, value e, value a, value v)
{
}



// should extract the implications from a bag
void start_fixedpoint() 
{
    heap h = allocate_rolling(pages);
    table t = create_value_table(h);
    vector handlers = allocate_vector(h,10);
    boolean pass = true;
    insertron in = cont(h, inserty, t, &pass);
        
    table scopes = create_value_table(h);
    table_set(scopes, intern_cstring("transient"), generate_uuid());
    table_set(scopes, intern_cstring("session"), generate_uuid());

    table_foreach(implications, i, v) {
        // last argument is terminal, ignore for a moment since the
        // evaluation is synchronous
        vector_insert(handlers, build(i, scopes, 0, in, 0));
    }

    while (pass) {
        pass = false;
        vector_foreach(handlers, k) {
            // synch
            execute(k);
        }
    }
    table_foreach(t, k, v) {
        prf("%v:\n %b\n", k, bag_dump(h, v));
    }
}
