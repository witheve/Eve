#include <unix_internal.h>
#include <pthread.h>


static void *start_thread(void *z)
{
    context c = z;
    pthread_setspecific(pkey, c);
    prf("thread started\n");
    apply(c->start);
    unix_wait();
    return 0;
}

context thread_init(heap page_heap, thunk start)
{
    context c = init_context(page_heap);
    c->start = start;
    pthread_create(&c->p, 0, start_thread, c);
    return c;
}

static context io_thread = 0;

static CONTINUATION_4_0(io_write, descriptor, buffer, tid, thunk);

static void io_write(descriptor d, buffer b, tid result, thunk t)
{
    write(d, bref(b, 0), buffer_length(b));
    thread_send(result, t);
}

void asynch_write(descriptor d, buffer b, thunk finished)
{
    if (!io_thread) 
        io_thread = thread_init(pages, ignore);
    
    thread_send(io_thread->tid, cont(init, io_write, d, b, tcontext()->tid, finished));
}

