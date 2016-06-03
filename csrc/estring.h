typedef value estring;
estring intern_string(unsigned char *, int);


// this intermediate is so we can compare things without copying up front, but its
// kinda sad. the truth is we dont really need symmetry in the comparison
typedef struct string_intermediate {
    unsigned int length;
    unsigned char *body;
} *string_intermediate;


static inline boolean si_compare(void *a, void *b) 
{
    string_intermediate sia = a, sib = b;
    if (sia->length != sib->length) return false;
    return !memcmp(sia->body, sib->body, sia->length);
}

static inline iu64 si_hash(void *z)
{
    string_intermediate si = z;
    return shash(si->body, si->length);
}
