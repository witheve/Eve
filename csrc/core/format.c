#include <core.h>

char *hex_digits="0123456789abcdef";

#define MAX(a, b) ((a)>(b)?(a):(b))

void format_number(string s, u64 x, int base, int pad)
{
    if ((x > 0) || (pad > 0)) {
        format_number(s, x/base, base, pad - 1);
        string_insert(s, hex_digits[x%base]);
    }
}

// should entertain a registration method with a type and a character and a function pointer
// or maybe just float this up to runtime
extern void print_value();
extern void print_value_raw();
extern void print_value_vector();

void vbprintf(string s, string fmt, va_list ap)
{
    character i;
    int state = 0;
    int base = 0;
    int pad;
    int count = 0;

    string_foreach(fmt, i) {
        switch (state){
        case 2:
            for (int j = 0; j < count; j++)
                string_insert(s, i);
            state = 0;
            break;

        case 0:
            base = 10;
            pad = 0;
            if (i == '%') state = 3;
            else string_insert(s, i);
            break;

        case 1:
            if ((i >= '0') && (i <= '9')) {
                pad = pad * 10 + digit_of(i);
                break;
            } else {
                state = 3;
            }

        case 3:
            switch (i) {
            case '0':
                state = 1;
                break;

            case '%':
                string_insert(s, '\%');
                break;

            case 't':
                print_time(s, va_arg(ap, ticks));
                break;

            case 'b':
                string_concat(s, (va_arg(ap, string)));
                break;

            case 'n':
                count = va_arg(ap, unsigned int);
                state = 2;
                break;

            case 'c':
                string_insert(s, va_arg(ap, int));
                break;

            case 's':
                {
                    char *c = va_arg(ap, char *);
                    if (!c) c = (char *)"(null)";
                    int len = cstring_length(c);
                    for (int i =0 ; i < pad; i++)
                        string_insert(s, ' ');
                    pad = 0;
                    for (; *c; c++)
                        string_insert(s, *c);
                }
                break;

            case 'S':
                {
                    unsigned int x = va_arg(ap, unsigned int);
                    for (int i =0 ; i < x; i++) string_insert(s, ' ');
                    break;
                }

            case 'p':
                pad = 16;
                unsigned long x = va_arg(ap, unsigned long);
                format_number(s, x, 16, pad?pad:1);
                break;

            case 'l':
                pad = 0;
                unsigned long z = va_arg(ap, unsigned long);
                format_number(s, z, 10, pad?pad:1);
                break;

            case 'x':
                base=16;

            case 'o':
                if (base == 10) base=8;
            case 'u':
                {
                    unsigned int x = va_arg(ap, unsigned int);
                    format_number(s, x, base, pad?pad:1);
                    break;
                }

             // xxx - layer violation..meh
             // also generalize string pad support
            case 'v':
                if (pad) {
                    // xxx  transient or resizable stack head
                    buffer b = allocate_string(s->h);
                    print_value(b, va_arg(ap, void *));
                    int z = buffer_length(b);
                    // xxx utf token length
                    for (int i =0 ; (pad < z) && (i < (pad-z)); i++) string_insert(s, ' ');
                    buffer_append(s, bref(b, 0), buffer_length(b));
                    pad = 0;
                    state = 0;
                } else print_value(s, va_arg(ap, void *));
                break;

            case 'r':
                if (pad) {
                    // xxx  transient or resizable stack head
                    buffer b = allocate_string(s->h);
                    print_value_raw(b, va_arg(ap, void *));
                    int z = buffer_length(b);
                    // xxx utf token length
                    for (int i =0 ; (pad < z) && (i < (pad-z)); i++) string_insert(s, ' ');                    
                    buffer_append(s, bref(b, 0), buffer_length(b));
                    pad = 0;
                    state = 0;
                } else print_value_raw(s, va_arg(ap, void *));
                break;

            case 'V':
                print_value_vector(s, va_arg(ap, void *));
                break;

            case 'X':
                // xxx - utf8 will break this
                 {
                  buffer xx = va_arg(ap, buffer);
                  string_foreach(xx, i){
                     print_byte(s, i);
                  }
                 }
                break;

            case 'd': case 'i':
                {
                    int x = va_arg(ap, int);
                    if (x <0){
                        string_insert(s, '-');
                        x = -x;
                    }
                    format_number(s, (unsigned int)x, base, pad?pad:1);
                    break;
                }
            default:
                break;
            }
            // badness
            if (state == 3)
                state = 0;
            break;
        }
    }
}


string aprintf(heap h, char *fmt, ...)
{
    string b = allocate_string(h);
    va_list ap;
    string f = alloca_string(fmt);
    va_start(ap, fmt);
    vbprintf(b, f, ap);
    va_end(ap);
    return(b);
}

void bbprintf(string b, string fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vbprintf(b, fmt, ap);
    va_end(ap);
}
