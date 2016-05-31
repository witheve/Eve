#include <runtime.h>
#include <unix.h>


struct timer {
    thunk t;
    ticks  w;
    ticks  interval; // one-shot only?
    boolean   disable;
};

static pqueue timers;
static heap theap;

static boolean timer_less_than(timer a, timer b)
{
    return(a->w < b->w);
}

void timer_print(string s, timer t)
{
    bprintf (s, "<%v %v>", t->w, t->t);
}

void remove_timer(timer t)
{
    t->disable = true;
}

timer register_timer(ticks interval, thunk n)
{
    timer t=(timer)allocate(theap, sizeof(struct timer));

    t->t= n;
    t->interval = interval;
    t->disable = 0;
    t->w = 0;
    t->w = now() + interval;
    pqueue_insert(timers, t);
    return(t);
}

timer register_periodic_timer(ticks interval, thunk n)
{
    timer t = allocate(theap, sizeof(struct timer));

    t->t = n;
    t->disable = 0;
    t->w = 0;
    now(t->w);
    pqueue_insert(timers, t);
    return(t);
}

ticks time_delta(heap h, ticks x, ticks n)
{
    return( x-n);
}


boolean timer_check(ticks d)
{
    timer current = false;

    while ((current = pqueue_peek(timers)) &&
           (now(d), current->w < d)) {
        if (!current->disable) {
            pqueue_pop(timers);
            apply(current->t);
        }
    }
    if (current) {
        iu64 h = d;
        d = current->w-h;
        return(true);
    }
    return(false);
}


ticks parse_time(string b)
{
    character c;
    iu64 s = 0, frac = 0, fracnorm = 0;
    ticks result;

    string_foreach (c, b) {
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

void print_time(string b, value v)
{
    unsigned int *f=(unsigned int *)v;

    // assumes little endian
    bprintf(b, "%u", f[1]);
    if (f[0]) {
        iu64 t = f[0];
        int count=0;

        bprintf(b,".");

        /* should round or something */
        while ((t *= 10) && (count++ < 6)) {
            iu32 d = (t>>32);
            bprintf (b, "%d", d);
            t -= ((iu64)d)<<32;
        }
    }
}

void initialize_timers(heap h)
{
    timers = allocate_pqueue(h);
    theap = h;
}
