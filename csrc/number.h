
// float is just supposed to be an in exaclt leaf of a broader numeric tower, but as
// of today, is the numeric tower

static inline value box_float(heap h, double x)
{
    void *result = allocate(h, 1 + sizeof(float));
    *(double *)(result + 1) = x;
    return result;
}
