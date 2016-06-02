


heap float_heap;

// float is just supposed to be an inexact leaf of a broader numeric tower, but as
// of today, is the numeric tower

static inline value box_float(double x)
{
    void *result = allocate(float_heap, 1 + sizeof(double));
    *(double *)result = x;
    return result;
}
