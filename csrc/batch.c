#include <runtime.h>

// length can be static here, otherwise looks like a buffer :(
typedef struct batch {
    heap h;
    int fill, length;
    value *contents;
    struct batch *next;
} *batch;

static void batch_append() 
batch allocate_batch(heap h, int length, value u)
{
    
}

void append_batch(batch f, value e, value a, value v, value b)
{
    
}

void commit_batch(batch f, value t)
{
    batch b = f;
    do {
        for (int i =0; i <b->fill ; i+=4) {
            insertron i = table_find(bag_table, f->contents[i+3]);
            apply(i, f->contents[i], f->contents[i+1], f->contents[i+2]); 
        }
    } while ((b = b->next));
}

