
typedef struct timer *timer;
timer register_timer(ticks, thunk n);
void remove_timer();
void initialize_timer();
ticks parse_time();
boolean timer_check(ticks d);
ticks now();


static inline ticks seconds(int n)
{
    return(((iu64)n)<<32);
}

static inline ticks milliseconds(int n)
{
    return((((iu64)n)<<32)/1000ull);
}
