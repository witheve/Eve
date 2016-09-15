#include <core/core.h>
#include <unistd.h>
#include <sys/stat.h>
#include <limits.h>
#include <serialize.h>
#include <fcntl.h>
#include <stdlib.h>

// 3rd copy in the tree :/, not particularily robust
static inline double parse_float(char *b, int len)
{
    boolean fractional = false;
    double rez = 0;
    int start = 0;
    double fact = (*b=='-')?(b++, len--,-1.0):1.0;

    for (; len > 0 ; b++, len --) {
        if (*b == '.'){
            fractional = true;
        } else {
            if (fractional) fact /= 10.0f;
            rez = rez * 10.0f + (double)digit_of(*b);
        }
    }
    return rez * fact;
}

static char hex_digit[]={'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'};
static inline void bwrite(byte x)
{
    // add buffering
    write(1, &x, 1);
}


#define pad(x, y) (((((x)-1)/(y)) +1) *(y))

static inline void encode_integer(int offset, byte base, u64 value)
{
    int len = first_bit_set(value) + 1;
    int space = 7 - offset;
    byte out = base ;
    int total = pad(len + offset, 7);
    total -= offset;

    while (total > 0) {
        bwrite(out | ((total > space)?(1<<space):0) | extract(value, total, space));
        total -= space;
        space = 7;
        out = 0;
    }
}


static void write_string(char *body, int length)
{
    encode_integer(2, 0x40, length);
    write(1, body, length);
}

extern char *pathroot;

void *memcpy(void * dst, const void *src, size_t n);

static void include_file(char *name, int length)
{
    struct stat st;
    char err[]= "file not found ";
    char t[PATH_MAX];
    int plen = 0;
    for (char *i = pathroot; *i; i++, plen++);
    memcpy(t, pathroot, plen);
    memcpy(t+plen, name, length);
    t[plen+length]=0;

    int fd = open(t, O_RDONLY);
    if (fd <= 0) {
        write(2, err, sizeof(err) - 1);
        write(2, t, plen + length);
        write(2, "\n", 1);
        exit(-1);
    }

    fstat(fd, &st);
    int flen = st.st_size;
    // encode the length
    void *buf = alloca(flen);
    read(fd, buf, flen);
    write_string(buf, flen);
    close(fd);
}

void *memset(void *b, int c, size_t len);

static void write_term(char *x, int length)
{
    char start = x[0];
    if (start == '%') {
        int n = 0;
        for(char *r = x + 1; *r; r++)
            n = (n * 10) + (*r - '0');
        char buf[12];
        memset(buf, 0, sizeof(buf));
        buf[0] = 0x80;
        buf[11] = n; /// xxx - 256
        write(1, buf, sizeof(buf));
        return;
    }

    if (((start >= '0') && (start <= '9')) || (start == '-')) {
        double d = parse_float(x+1, length -1);
        bwrite(float64_prefix);
        write(1, &d, sizeof(double));
        return;
        // xxx - little endian
    }


    if (start == '{') {
        include_file(x+1, length-2);
        return;
    }

    write_string(x, length);
}

int main()
{
    int fill = 0;
    int comment = 0;
    char term[1024];
    char x;
    while (read(0, &x, 1) > 0 ) {
        if (x == '#') comment = 1;

        if (comment && (x != '\n'))  continue;

        comment = 0;

        if ((x == ' ') || (x == '\n')) {
            if (fill) {
                write_term(term, fill);
                fill = 0;
            }
        } else term[fill++] = x;
    }
}
