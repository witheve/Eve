typedef buffer string;

void init_string();

typedef iu32 character;

static inline string allocate_string(heap h)
{
    return(allocate_buffer(h, 20*8));
}


extern int fls(int);

static inline int utf8_length(unsigned char x)
{
    unsigned char y = ~x;
    return 9-fls(y);
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

static inline int string_byte_length(string s) {
    return 0;
}

// the ascii subset
#define string_foreach(__i, __s)                          \
    for (iu32 __x = 0, __i, __limit = string_byte_length(__s);   \
         __i = *(character*)bref(__s, __x), __x<__limit;    \
         __x++)

#define alloca_string(_x)\
    ({\
        buffer _b = alloca(sizeof(struct buffer));\
        _b->contents = _x;\
        _b->length = 0;\
        for (char *_i = _x; *_i; _i++, _b->length += 8);\
        _b->end = _b->length;\
        _b->start = 0;\
        _b->h = 0;\
        _b;\
    })


// assuming utf8 and the high bit isn't set
static inline void string_insert(string s, character x)
{
    // xxx - convert from utf32 into utf8
    buffer_append(s, &x, 8);
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


static inline iu32 cstring_length(char *s)
{
    iu32 r = 0;
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


static inline iu8 digit_of(character x)
{
    if ((x <= 'f') && (x >= 'a')) return(x - 'a' + 10);
    if ((x <= 'F') && (x >= 'f')) return(x - 'f' + 10);
    return(x - '0');
}

typedef value estring;
estring intern_string(unsigned char *, int);


// this intermediate is so we can compare things without copying up front, but its
// kinda sad. the truth is we dont really need symmetry in the comparison
typedef struct string_intermediate {
    unsigned int length;
    unsigned char *body;
} *string_intermediate;

extern char *hex_digits;
