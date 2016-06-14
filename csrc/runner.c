#include <runtime.h>

// should be out of the bag
table implications;

void register_implication(node n)
{
    if (!implications) 
        implications = allocate_table(init, key_from_pointer, compare_pointer); 
    table_set(implications, n, (void *)1);
}

static CONTINUATION_2_3(inserty, bag, boolean *, value, value, value);
static void inserty(bag b, boolean *flag, value e, value a, value v)
{
    *flag = true;
    //    bag b = table_get(multibag, u);
    prf("zikky: %p %v %v %v\n", e, e, a, v);

    edb_insert(b, e, a, v);
}

// should extract the implications from a bag
void start_fixedpoint() 
{
    heap h = allocate_rolling(pages);
    bag b = create_bag();
    vector handlers = allocate_vector(h,10);
    boolean pass = true;
    insertron in = cont(h, inserty, b, &pass);
    
    table_foreach(implications, i, v) {
        // last argument is terminal, ignore for a moment since the
        // evaluation is synchronous
        vector_insert(handlers, build(i, in, b, 0));
    }

    while (pass) {
        pass = false;
        vector_foreach(handlers, k) {
            // synch
            execute(k);
        }
    }
    prf("%b\n", bag_dump(h, b));
    // and ... what
}
