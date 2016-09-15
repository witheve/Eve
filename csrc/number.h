heap float_heap;

// float is just supposed to be an inexact leaf of a broader numeric tower, but as
// of today, is the numeric tower

static inline value box_float(double x)
{
    void *result = allocate(float_heap, sizeof(double));
    *(double *)result = x;
    return result;
}

// redundant w/ json, not particularily robust
static inline double parse_float(buffer b)
{
    int len = buffer_length(b);
    boolean fractional = false;
    double rez = 0;
    int start = 0;
    double fact = ((*(unsigned char *)bref(b, 0))=='-')?(start++, -1.0):1.0;

    for (int i = start; i < len ; i++) {
        character s =  *(unsigned char *)bref(b, i);
        if (s == '.'){
            fractional = true;
        } else {
            if (fractional) fact /= 10.0f;
            rez = rez * 10.0f + (double)digit_of(s);
        }
    }
    return rez * fact;
}
