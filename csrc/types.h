
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

#define efalse ((void *)(register_space + 0x1000000000))
#define etrue ((void *)(register_space + 0x1000000001))
#define register_ignore ((void *)(register_space + 0x1000000002))

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

static inline unsigned long type_of (void *x)
{
    return ((unsigned long)x) & region_mask;
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

