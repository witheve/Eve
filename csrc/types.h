// bibop -
#define region_mask 0x7ffe00000000ull
#define region_size 0x10000000000ull
// each of these is a 1T space
#define uuid_space 0x10000000000ull
#define float_space 0x20000000000ull
#define estring_space 0x30000000000ull
// not actually used
#define register_space 0x40000000000ull
#define register_base register_space

#define efalse ((void *)(register_space + 0x100000000))
#define etrue ((void *)(register_space + 0x100000001))
#define enone ((void *)(register_space + 0x10000003))
#define register_ignore ((void *)(register_space + 0x100000002))

#define allocation_space 0xa0000000000ull

typedef struct type {
    void (*print)(buffer, void *, heap);
    u64 (*hash)(void *);
    // serialization length
    u64 (*length)(void *);
    int (*serialize)(buffer b, void *);
    void *(*deserialize)(buffer b);
} *type;

typedef struct values_diff {
  vector insert;
  vector remove;
} *values_diff;




static inline u64 type_of (void *x)
{
    return ((u64)x) & region_mask;
}

static inline u64 fold_key(u64 key)
{
    key ^= key >> 32;
    key ^= key>>16;
    key ^= key>>8;
    return key;
}

static inline u64 value_as_key(value v)
{
    if (type_of(v) == float_space) {
        return fold_key(*(u64 *)v);
    }
    return fold_key((u64)v);
}

// assumes bibop and interned strings and uuids
static boolean value_equals(value a, value b)
{
    if (a == b) return true;
    if ((type_of(a) == float_space) && (type_of(b) == float_space)) {
        return *(double *)a == *(double *)b;
    }
    return false;
}

static inline value value_table_find (table t, void *c)
{
    key k = value_as_key(c);

    for (entry i = t->entries[k%t->buckets];
         i; i = i->next)
        if ((i->k == k) && value_equals(i->c, c))
            return(i->v);

    return(EMPTY);
}

typedef void *uuid;
uuid intern_uuid(unsigned char *x);
void init_uuid();

void print_value(buffer, value);
void print_value_raw(buffer, value);
u64 value_as_key(value);
boolean value_equals(value, value);

u64 value_vector_as_key(void *);
boolean value_vector_equals(void *, void *);

values_diff diff_value_vector_tables(heap, table, table);
boolean order_values(void *, void *);

static inline table create_value_table(heap h)
{
    return  allocate_table(h, value_as_key, value_equals);
}

static inline table create_value_vector_table(heap h)
{
    return  allocate_table(h, value_vector_as_key, value_vector_equals);
}
