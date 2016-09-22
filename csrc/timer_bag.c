#include <runtime.h>

typedef struct timer_bag {
    struct bag b;
} *timer_bag;


static CONTINUATION_1_5(timer_scan, timer_bag, int, listener, value, value, value);
static void timer_scan(timer_bag u, int sig, listener out, value e, value a, value v)
{
}

// xxx - this only supports a single timer domain, should
// have a better listener/dependency/subscription model
// so that everything isn't always firing

static CONTINUATION_1_1(timer_commit, timer_bag, edb);
static void timer_commit(timer_bag u, edb s)
{
    prf("%b\n", edb_dump(init, s));
}

static void timer_expiry()
{
}

bag timer_bag_init()
{
    heap h = allocate_rolling(pages, sstring("timer bag"));
    timer_bag tb = allocate(h, sizeof(struct timer_bag));
    tb->b.commit = cont(h, timer_commit, tb);
    tb->b.scan = cont(h, timer_scan, tb);
    tb->b.block_listeners = allocate_table(h, key_from_pointer, compare_pointer);
    tb->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    tb->b.blocks = allocate_vector(h, 1);
    return (bag)tb;
}

