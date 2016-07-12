#include <core.h>
     
typedef u32 index; //indices are off by 1 from vector references

static inline void swap(pqueue q, index x, index y)
{
    void *temp = vector_get(q->v, x-1);
    vector_set(q->v, x-1, vector_get(q->v, y-1));
    vector_set(q->v, y-1, temp);
}


#define qcompare(__q, __x, __y)\
  (q->compare(vector_get(__q->v, (__x-1)), \
              vector_get(__q->v, (__y-1))))

static void heal(pqueue q, index where)
{
    index left= where<<1;
    index right = left+1;
    index min = where;
    index len = vector_length(q->v);
    
    if (left <= len)
        if (qcompare(q, left, min)) min = left;

    if (right <= len)
        if (qcompare(q, right, min)) min = right;

    if (min != where) {
        swap(q, min, where);
        heal(q, min);
    }
}

static void add_pqueue(pqueue q, index i)
{
    index parent = i >> 1;

    if ((parent > 0) && qcompare(q, i, parent)) {
        swap(q, i, parent);
        add_pqueue(q, parent);
    }
}

void pqueue_insert(pqueue q, void *v)
{
    vector_insert(q->v, v);
    add_pqueue(q, vector_length(q->v));
}

void *pqueue_pop(pqueue q)
{
    void *result = EMPTY;

    if (vector_length(q->v) > 0) {
        result = vector_get(q->v, 0);
        void *n = vector_pop(q->v);
        if (vector_peek(q->v) != EMPTY) {
            vector_set(q->v, 0, n);
            heal(q, 1);
        }
    }
    return(result);
}

void *pqueue_peek(pqueue q)
{
    if (vector_length(q->v))
        return(vector_get(q->v, 0));
    return(false);
}


pqueue allocate_pqueue(heap h, boolean (*compare)(void *, void *))
{
    pqueue q = allocate(h, sizeof(struct pqueue));
    q->v = allocate_vector(h, 4);
    q->compare = compare;
    return(q);
}
