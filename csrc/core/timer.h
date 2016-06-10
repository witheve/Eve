
typedef struct timer *timer;
timer register_timer(ticks, thunk n);
void remove_timer();
void initialize_timer();
ticks parse_time();
void print_time(string b, ticks t);
ticks timer_check(ticks d);
ticks now();


static inline ticks seconds(int n)
{
    return(((iu64)n)<<32);
}

static inline ticks milliseconds(int n)
{
    return((((iu64)n)<<32)/1000ull);
}


// this is actually* ticks, not the normalized fixed point seconds we use elsewhere
static ticks rdtsc(void)
{
    unsigned a, d;
    asm("cpuid");
    asm volatile("rdtsc" : "=a" (a), "=d" (d));

    return (((ticks)a) | (((ticks)d) << 32));
}
