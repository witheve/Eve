#include <core.h>
#include <unix.h>


struct timer {
    thunk t;
    ticks  w;
    ticks  interval; // one-shot only?
    boolean   disable;
};

static pqueue timers;
static heap theap;

void remove_timer(timer t)
{
    t->disable = true;
}

timer register_timer(ticks interval, thunk n)
{
    timer t=(timer)allocate(theap, sizeof(struct timer));

    t->t= n;
    t->interval = 0;
    t->w = now() + interval;
    pqueue_insert(timers, t);
    return(t);
}

timer register_periodic_timer(ticks interval, thunk n)
{
    timer t = allocate(theap, sizeof(struct timer));

    t->t = n;
    t->interval = interval;
    t->disable = 0;
    t->w = now();
    pqueue_insert(timers, t);
    return(t);
}

ticks time_delta(heap h, ticks x, ticks n)
{
    return( x-n);
}


ticks timer_check()
{
    timer current = false;
    
    while ((current = pqueue_peek(timers)) &&
           (current->w < now())) {
        if (!current->disable) {
            pqueue_pop(timers);
            if (current->interval) {
                current->w += current->interval;
                pqueue_insert(timers, current);
            }
            apply(current->t);
        }
    }
    if ((current = pqueue_peek(timers)) != 0) {
        // presumably this can be negative
        return (current->w < now());
    }
    return(0);
}


ticks parse_time(string b)
{
    character c;
    iu64 s = 0, frac = 0, fracnorm = 0;
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
    iu64 fraction = f&0xfffffffful;

    bprintf(b, "%u", seconds);
    if (fraction) {
        int count=0;
        
        bprintf(b,".");
        
        /* should round or something */
        while ((fraction *= 10) && (count++ < 6)) {
            iu32 d = (fraction>>32);
            bprintf (b, "%d", d);
            fraction -= ((iu64)d)<<32;
        }
    }
}

static boolean compare_timer(void *za, void *zb) 
{
    timer a = za;
    timer b = zb;
    return (a->w < b->w);
}

void initialize_timers(heap h)
{
    timers = allocate_pqueue(h, compare_timer);
    theap = h;
}
