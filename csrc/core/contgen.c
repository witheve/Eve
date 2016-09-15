#include <stdarg.h>
#include <stdlib.h>
#include <unistd.h>

char *output;
int size;
int fill;
int nleft, nright;
int twiggy;

void ins(char x)
{
    if (fill == size) output = realloc(output, size *= 2);
    output[fill++] = x;
}

void pint(int x)
{
    if (x) {
        pint(x/10);
        ins('0' + (x%10));
    }
}

void pi(char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    for (char *i = fmt; *i ; i ++) {
        switch (*i) {
        case '@':
            if (twiggy) {
                ins(',');
                ins(' ');
            }
            break;
            
        case '%':
            {
                int x = va_arg(ap, unsigned int);
                if (x) pint(x); else ins('0'); 
            }
            break;
        case '^':
            {
                void (*x)(char *) = va_arg(ap, void *);
                char *y = va_arg(ap, char *);
                x(y);
            }
            break;
        case '|':
            ins('\\');
            ins('\n');
            break;
        default: ins(*i);
        }
    }
    va_end(ap);
}

#define p(...)  {twiggy = 0; pi(__VA_ARGS__);}


void righto(char *format)
{
    for (int i = 0 ; i< nright; i++)  {
        pi(format, i, i);
        twiggy = 1;
    }
}

void lefto(char *format)
{
    for (int i = 0 ; i< nleft; i++)  {
        pi(format, i, i);
        twiggy = 1;
    }
}

void cblock()
{
    p("#define CONTINUATION_%_%(_name^^)|", nleft, nright, lefto, ", _l%", righto, ", _r%");
    p("void _name(^^);|", lefto, "@_l%", righto, "@_r%");
    p("struct _continuation_##_name{|");
    p("  void (*_apply)(void *^);|", righto, ", _r%");
    p("  char *name;|");
    for (int i = 0; i < nleft ; i++)  p("  _l% l%;|", i, i);
    p("};|");
    
    p("static void _apply_##_name(void *z^){|", righto, ", _r% r%");
    p("  struct _continuation_##_name *n = z;|");
    p("  _name(^^);|", lefto, "@n->l%", righto, "@r%");
    p("}|");
    
    p("static void (**_fill_##_name(struct _continuation_##_name* n, heap h^))(void *^){|", lefto, ", _l% l%", righto, ", _r%");
    p("  n->_apply = _apply_##_name;|");
    p("  n->name = #_name;|");
    for (int i = 0; i < nleft ; i++)  p("  n->l% = l%;|", i, i);
    p("  return (void (**)(void *^))n;|", righto, ", _r%");
    p("}\n\n");
}

int main(int argc, char **argv)
{
    int lc = atoi(argv[1]);
    int rc = atoi(argv[2]);
    for (nleft = 0; nleft < lc; nleft++)
        for (nright = 0; nright < rc; nright++)
            cblock();
    write(1, output, fill);
}
