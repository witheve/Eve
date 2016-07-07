
static void exec_error(evaluation e, char *format, ...)
{
    prf ("error %s\n", format);
}

static inline execf resolve_cfg(evaluation e, node n, int index)
{
    return (*(execf *)table_find(e->nmap, vector_get(n->arms, index)));
}

static int toreg(value k)
{
    return((unsigned long) k - register_base);
}

static inline value lookup(value *r, value k)
{
    if (type_of(k) == register_space)  {
        // good look keeping your sanity if this is a non-register value in this space
        return(r[toreg(k)]);
    }
    return k;
}

static int *register_counter(evaluation e, node n)
{
    int *c = allocate(e->h, sizeof(int));
    table_set(e->counters, n, c);
    return c;
}

static inline void extract(vector dest, vector keys, value *r)
{
    for (int i = 0; i< vector_length(keys); i ++) {
        vector_set(dest, i, lookup(r, vector_get(keys, i)));
    }
}


static inline void store(value *r, value reg, value v)
{
    if (reg != register_ignore)
        r[toreg(reg)] = v;
}


static inline void copyout(value *r, vector keys, vector source)
{
    for (int i = 0; i< vector_length(keys); i++) 
        store(r, vector_get(keys, i), vector_get(source, i));
}

// should try to throw an error here for writing into a non-reg
static inline int reg(value n)
{
    return ((unsigned long) n - register_base);
}


