
typedef buffer vector;

vector allocate_vector(heap, int);
typedef vector fifo;
fifo allocate_fifo(heap);
static inline u32 vector_length(vector v)
{
    return(buffer_length(v)/sizeof(void *));
}

vector build_vector_internal(heap, ...);

#define END_OF_ARGUMENTS ((void *)-1)

#define build_vector(_h, ...)\
    build_vector_internal(_h, ##__VA_ARGS__, END_OF_ARGUMENTS)

#define build_fifo(_h, ...)\
    set_type(build_vector_internal(_h, ##__VA_ARGS__, END_OF_ARGUMENTS),\
             t_fifo)


//bootstrap
void vector_insert(vector, void *);
u32 vector_length(vector);

void *vector_get(vector v, int element);
void vector_set(vector v, int element, void *x);
#define vector_foreach(__s, __i)\
    for (void * __i, *__j = (void *)0; __i = vector_get(__s, (unsigned long)__j), (unsigned long)__j < vector_length(__s); __j = (void *)((unsigned long)__j + 1))


static inline void *vector_peek(vector t)
{
    int len = vector_length(t);
    if (len) {
        return(vector_get(t, len - 1));
    }
    return(EMPTY);
}

static inline void *vector_pop(vector t)
{
    int len = vector_length(t);
    if (len) {
        void *v = vector_get(t, len -1);
        t->end -= sizeof(void *);
        return(v);
    }
    return(EMPTY);
}

static inline void push(vector t, void *n)
{
    buffer_append(t, &n, sizeof(void *));
}

