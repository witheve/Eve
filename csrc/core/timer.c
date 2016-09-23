#include <core.h>
#include <unix.h>

struct timer {
    thunk t;
    ticks  w;
    ticks  interval; // one-shot only?
    boolean   disable;
};

struct timers {
    pqueue q;
    heap h;
};

void remove_timer(timer t)
{
    t->disable = true;
}

timer register_timer(timers t, ticks interval, thunk call)
{
    timer n = (timer)allocate(t->h, sizeof(struct timer));
    n->t = call;
    n->disable = false;
    n->interval = 0;
    n->w = now() + interval;
    pqueue_insert(t->q, n);
    return(n);
}

timer register_periodic_timer(timers t, ticks interval, thunk call)
{
    timer n = allocate(t->h, sizeof(struct timer));
    n->t = call;
    n->disable = false;
    n->interval = interval;
    n->w = now();
    pqueue_insert(t->q, n);
    return(n);
}

ticks time_delta(heap h, ticks x, ticks n)
{
    return( x-n);
}

ticks timer_check(timers t)
{
    timer current;

    while ((current = pqueue_peek(t->q)) &&
           (current->w < now())) {
        pqueue_pop(t->q);
        if (!current->disable) {
            if (current->interval) {
                current->w += current->interval;
                pqueue_insert(t->q, current);
            }
            if (current->t != 0)
                apply(current->t);
        }
    }

    if ((current = pqueue_peek(t->q)) != 0) {
        // presumably this can be negative
        return (current->w - now());
    }
    return(0);
}


ticks parse_time(string b)
{
    character c;
    u64 s = 0, frac = 0, fracnorm = 0;
    ticks result;

    string_foreach (b, c) {
        if (c == '.')  {
            fracnorm = 1;
        } else {
            if (fracnorm) {
                frac = frac*10 + digit_of(c);
                fracnorm *= 10;
            } else s = s *10 + digit_of(c);
        }
    }
    result = s << 32;

    if (fracnorm) result |= (frac<<32)/fracnorm;
    return(result);
}

// this seems quite broken
void print_time(string b, ticks f)
{
    unsigned int seconds = f>>32;
    u64 fraction = f&0xfffffffful;

    bprintf(b, "%u", seconds);
    if (fraction) {
        int count=0;

        bprintf(b,".");

        /* should round or something */
        while ((fraction *= 10) && (count++ < 6)) {
            u32 d = (fraction>>32);
            bprintf (b, "%d", d);
            fraction -= ((u64)d)<<32;
        }
    }
}

static boolean compare_timer(void *za, void *zb)
{
    timer a = za;
    timer b = zb;
    return (a->w < b->w);
}

timers initialize_timers(heap h)
{
    timers t = allocate(h, sizeof(struct timers));
    t->q = allocate_pqueue(h, compare_timer);
    t->h = h;
    return t;
}
