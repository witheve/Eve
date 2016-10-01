
typedef struct pqueue {
    vector v;
    boolean (*compare)(void *, void *);
} *pqueue;

pqueue allocate_pqueue(heap h, boolean compare(void *, void *));
void pqueue_insert(pqueue q, void *v);
void *pqueue_peek(pqueue q);
void *pqueue_pop(pqueue q);

