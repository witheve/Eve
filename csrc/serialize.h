/* there should be a 'this' uuid for container metadata..files and connections */

/*
 * note on denormal numbers - highest 11 bits are zero
 */

#define type_uuid 0x80
#define type_string 0x40

#define station_prefix 0x06
#define ignore_constant 0x05
#define register_prefix 0x04
#define float64_prefix  0x03
#define true_constant    0x02
#define false_constant   0x01

static inline int first_bit_set(u64 value)
{
    return(63-__builtin_clzll(value));
}

static inline u64 mask(int x)
{
    return((1<<x) -1);
}

static inline byte extract(u64 source, int highest_start, int bits)
{
    int x = highest_start - bits;
    if (x < 0) x = 0;
    return (source >> x) & ((1<<bits) -1);
}
