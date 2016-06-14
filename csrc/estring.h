
typedef struct estring {
    unsigned int length;
    unsigned char *body;
} *estring;

estring intern_string(unsigned char *, int);

static inline boolean si_compare(void *a, void *b) 
{
    estring sia = a, sib = b;
    if (sia->length != sib->length) return false;
    return !memcmp(sia->body, sib->body, sia->length);
}

static inline iu64 si_hash(void *z)
{
    estring si = z;
    return shash(si->body, si->length);
}

static inline value intern_cstring(char *x)
{
    return intern_string((unsigned char *)x, cstring_length(x));
}

static inline estring intern_buffer(buffer b)
{
    return intern_string(bref(b,0), buffer_length(b));
}

