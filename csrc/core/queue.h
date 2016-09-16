typedef struct queue {
    heap h;
    int read;
    int write;
    thunk *messages;
    int size;
    struct queue *next;
} *queue;


#define qwrap(q, x) ((x) & ((1<<(q)->size) -1))

static inline queue allocate_queue(heap h, int logsize)
{
    queue q = allocate(h, sizeof(struct queue));
    q->h = h;
    q->read = 0;
    q->write = 0;
    q->size = logsize;
    q->messages = allocate(h, 1<<logsize * sizeof(thunk));
    q->next = 0;
}

// this should really support some kind of backpressure
static inline void enq(queue *qp, thunk m)
{
    queue q = *qp;
    int next = qwrap(q, q->write + 1);

    if (next == q->read) {
        q->next = allocate_queue(q->h, q->size++);
        *qp = q->next;
        enq(qp, m);
    } else {
        // ideally this would be a streaming write so that messages doesn't jump
        // back and forth?
        // xxx - assumes ordered writes here 
        q->messages[q->write] = m;
        q->write = next;
    }
}

static void *qpoll(queue *qp)
{
    queue q = *qp;
    if (q->read != q->write) {
        void * m= q->messages[q->read];
        q->read = qwrap(q, q->read + 1);
        return m;
    }
    
    if (q->next) {
        // this is where we would free the old queue
        *qp = q->next;
        return qpoll(qp);
    }
    
    return (void *)0;
}
