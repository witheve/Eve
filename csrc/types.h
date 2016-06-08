
// the serialization typespace
#define uuid_bits 0x80
#define uuid_mask 0x7f

#define string_bits 0x20
#define string_mask 0x20

#define float_bits 0x13
#define float_mask 0x00


// 1 x x x x x x x uuid
// 0 1 x x x x x x uuid
// 0 0 1 x x x x x string
// 0 0 0 1 0 0 0 0 bigdec
// 0 0 0 1 0 0 0 1 float64
// 0 0 0 1 0 0 1 1 float64
// 0 0 0 0 0 0 0 1 true
// 0 0 0 0 0 0 0 0 false
//["0xxxxxxx"  decode-uuid]
//["111xxxxx"  decode-bigdec]
//["1010xxxx"  decode-vector]
//["1001xxxx"  decode-string]
//["10001010"  decode-five-tuple]
//["10001011"  version1]
//["10001001"  true]
//["10001000"  false]])]

// bibop - 
#define region_mask 0x7ffe00000000ull
#define region_size 0x10000000000ull
// each of these is a 1T space
#define uuid_space 0x10000000000ull
#define float_space 0x20000000000ull
#define estring_space 0x30000000000ull
//maybe give this guy an unpopulated region
#define register_space 0x00000000000ull
#define register_base 0x100ull

typedef struct type {
    void (*print)(buffer, void *, heap);
    iu64 (*hash)(void *);
    // serialization length
    iu64 (*length)(void *);
    int (*serialize)(buffer b, void *);
    void *(*deserialize)(buffer b);
} *type;



static inline unsigned long type_of (void *x)
{
    return ((unsigned long)x) & region_mask;
}

typedef void *uuid;
uuid intern_uuid(unsigned char *x);
void init_uuid();

void print_value(buffer, value);
