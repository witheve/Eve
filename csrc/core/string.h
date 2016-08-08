typedef buffer string;

void init_string();

typedef u32 character;

static inline string allocate_string(heap h)
{
    return(allocate_buffer(h, 20));
}

static inline int utf8_length(unsigned char x)
{
    if (~x & 0x80) return 1;
    if ((x & 0xe0) == 0xc0) return 2;
    if ((x & 0xf0) == 0xe0) return 3;
    if ((x & 0xf8) == 0xf0) return 4;
    // help
    return(1);
}


// this is not* the most effective implementation
static int inline string_rune_length(char *s) {
    int i = 0, j= 0;
    while (s[i]) {
        if ((s[i] & 0xC0) != 0x80)
            j++;
        i++;
    }
    return (j);
}


// the ascii subset
#define string_foreach(__s, __i)                          \
    for (u32 __x = 0, __i, __limit = buffer_length(__s);   \
         __i = *(u8 *)bref(__s, __x), __x<__limit;    \
         __x++)

// other defines and prototypes make it difficult to use someone else's
#define swap32(_x) ((((_x)>>24) & 0xffL) | (((_x)>>8) & 0xff00L) | \
                    (((_x)<<8) & 0xff0000L) | (((_x)<<24) & 0xff000000L))

#define rune_foreach(__s, __i)                                        \
    for (u32 __x = 0, *__t, __q, __i, __limit = buffer_length(__s);  \
         __i = 0, __t = (u32 *)bref(__s, __x), __q = utf8_length(*__t), \
         memcpy(&__i, __t, __q),                                      \
         __i = swap32(__i),                                           \
         __i = __i >> 8 * (4 - __q),                                  \
         __x<__limit;                                                 \
         __x += __q)


#define alloca_string(_x)\
    ({\
        buffer _b = alloca(sizeof(struct buffer));\
        _b->contents = _x;\
        _b->length = 0;\
        for (char *_i = _x; *_i; _i++, _b->length++);\
        _b->end = _b->length;\
        _b->start = 0;\
        _b->h = 0;\
        _b;\
    })


static inline character utf8_decode(u8 *x, int *count)
{
    if ((x[0] & 0xf0) == 0xf0) {
        *count = 4;
        return ((x[0] & 0xf) << 18)
            | ((x[1]&0x3f)<< 12)
            | ((x[2]&0x3f)<< 6)
            | (x[3]&0x3f);
    }
    
    if ((x[0] & 0xe0) == 0xe0) {
        *count = 3;
        return ((x[0] & 0x1f) << 12)
            | ((x[1]&0x3f)<< 6)
            | (x[2]&0x3f);
    }
    
    if ((x[0] & 0xc0) == 0xc0) {
        *count = 2;
        return ((x[0] & 0x3f) << 6)
            | (x[1]&0x3f);
    }
    
    *count = 1;
    return *x;
}

static inline void string_insert_rune(string s, character c)
{
    if (c<0x80) {
        buffer_write_byte(s, c);
    } else if (c<0x800) {
        buffer_write_byte(s, 0xc0 | (c>>6));
        buffer_write_byte(s, 0x80 | (c&0x3f));
    } else if (c<0x10000) {
        buffer_write_byte(s, 0xe0 | (c>>12));
        buffer_write_byte(s, 0x80 | ((c>>6) & 0x3f));
        buffer_write_byte(s, 0x80 | (c&0x3f));
    } else if (c<0x110000) {
        buffer_write_byte(s, 0xf0 | (c>>18));
        buffer_write_byte(s, 0x80 | ((c>>12)&0x3f));
        buffer_write_byte(s, 0x80 | ((c>>6)&0x3f));
        buffer_write_byte(s, 0x80 | (c&0x3f));
    }
    // i'm sorry, you didn't make it into the spec
}

static inline void string_insert(string s, character x)
{
    buffer_append(s, &x, 1);
}

static inline void string_concat(string d, string s) {
    buffer_append(d, s->contents + s->start, buffer_length(s));
}


void vbprintf(string s, string fmt, va_list ap);

static inline void bprintf(string s, char *cf, ...)
{
    va_list a;
    va_start(a, cf);
    vbprintf(s, alloca_string(cf), a);
}


static inline u32 cstring_length(char *s)
{
    u32 r = 0;
    for (char *i = s; *i; i++, r++);
    return r;
}

// the ascii subset
static inline string string_from_cstring(heap h, char *s)
{
    string b = allocate_string(h);
    char *i;

    for (i = s; *i; i++)
        string_insert(b, *i);

    return(b);
}


static inline u8 digit_of(character x)
{
    if ((x <= 'f') && (x >= 'a')) return(x - 'a' + 10);
    if ((x <= 'F') && (x >= 'f')) return(x - 'f' + 10);
    return(x - '0');
}


extern char *hex_digits;

#define sstring(__x) ({\
  static string __s = 0;\
  if (!__s) __s = string_from_cstring(init, __x);\
  __s;\
})

u64 string_hash(void *x);
boolean string_equal(void *a, void *b);

u64 shash(unsigned char *content, int length);
