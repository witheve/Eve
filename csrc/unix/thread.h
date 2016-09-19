// would be nice to abstract this further away from pthreads
#include <pthread.h>

extern struct context *primary;

typedef struct context {
    int tid;
    timers t;
    heap page_heap;
    heap h;
    selector s;
    queue *input_queues;
    queue *output_queues;
    // pipe per queue? queue as pipe?
    descriptor wakeup[2];
    pthread_t p;
    thunk start;
} *context;

context init_context();

typedef int tid;

// i'd really prefer not to include this everywhere, but it seems
// stupid to fight pthreads about maintaining tls
#include <pthread.h>

extern pthread_key_t pkey;
#define tcontext() ((context)pthread_getspecific(pkey))
