#include <runtime.h>

typedef struct timer_bag {
    struct bag b;
} *timer_bag;
    
// xxx - this only supports a single timer domain, should
// have a better listener/dependency/subscription model
// so that everything isn't always firing

static CONTINUATION_1_1(timer_commit, timer_bag, edb);
static void timer_commit(timer_bag u, edb s)
{
}

static void timer_expiry()
{
}

bag timer_bag_init()
{
    heap h = allocate_rolling(pages, sstring("timer bag"));
    timer_bag tb = allocate(h, sizeof(struct timer_bag));
    return (bag)tb;
}

