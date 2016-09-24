#include <runtime.h>

typedef struct timer_bag {
    struct bag b;
    evaluation ev;
    uuid running;
    table timers;
} *timer_bag;


static CONTINUATION_1_5(timer_scan, timer_bag, int, listener, value, value, value);
static void timer_scan(timer_bag u, int sig, listener out, value e, value a, value v)
{
    //    prf("timer scan %p\n", u->running);
    //    if ((sig == s_eAV) && (a == sym(tag)) && (v == sym(timer-expire)) && u->running)
    //        apply(out, u->running, a, v, 1, 0);
}


static CONTINUATION_2_0(timer_expiry, timer_bag, uuid)
static void timer_expiry(timer_bag u, uuid e)
{
    prf("timer expiry\n");
    edb event = create_edb(init, 0);
    apply(event->b.insert, e, sym(tag), sym(timer-expire), 1, 0);
    inject_event(u->ev, (bag)event);
}

// xxx - this only supports a single timer domain, should
// have a better listener/dependency/subscription model
// so that everything isn't always firing

static CONTINUATION_1_1(timer_commit, timer_bag, edb);
static void timer_commit(timer_bag u, edb s)
{
    // xxx - this is to prevent the listener from creating a cyclical update
    // it might be better to have a different registration or delivery
    // bag
    u->running = 0;
    edb_foreach_e(s, e, sym(tag), sym(timeout), c) {
        edb_foreach_v(s, e, sym(milliseconds), interval, c) {
            unsigned int ms =(unsigned int)(*(double *)interval);
            prf("regsiter %d\n", ms);
            timer t = register_timer(tcontext()->t, milliseconds(ms),
                                     cont(init, timer_expiry, u, e));
            // and maybe add it to the timers map?
        }
    }

    prf("%b\n", edb_dump(init, s));
}

// dont really want to fix this to an evaluation...but the old wiring
// doesn't leave much of an option
bag timer_bag_init(evaluation ev)
{
    heap h = allocate_rolling(pages, sstring("timer bag"));
    timer_bag tb = allocate(h, sizeof(struct timer_bag));
    tb->b.commit = cont(h, timer_commit, tb);
    tb->b.scan = cont(h, timer_scan, tb);
    tb->b.block_listeners = allocate_table(h, key_from_pointer, compare_pointer);
    tb->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    tb->b.blocks = allocate_vector(h, 1);
    tb->ev = ev;
    return (bag)tb;
}

