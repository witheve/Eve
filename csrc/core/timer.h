
typedef struct timer *timer;
typedef struct timers *timers;
timer register_timer(timers, ticks, thunk n);
timer register_periodic_timer(timers, ticks, thunk n);
void remove_timer();
timers initialize_timers(heap h);
ticks parse_time();
void print_time(string b, ticks t);
ticks timer_check();
ticks now();


static inline ticks seconds(int n)
{
    return(((u64)n)<<32);
}

static inline ticks milliseconds(int n)
{
    return((((u64)n)<<32)/1000ull);
}


// this is actually* ticks, not the normalized fixed point seconds we use elsewhere
static ticks rdtsc(void)
{
    volatile u64 a, d;
    asm volatile("rdtsc" : "=a" (a), "=d" (d));
    return (a | (d << 32));
}
