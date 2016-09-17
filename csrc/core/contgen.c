#include <stdarg.h>
#include <stdlib.h>
#include <unistd.h>

char *output;
int size;
int fill = 0;
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
        int count = nright;
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
            count = nleft;
        case '~':
            {
                char *subformat = va_arg(ap, char *);
                for (int i = 0 ; i< count; i++)  {
                    pi(subformat, i, i);
                    twiggy = 1;
                }
                break;
            }
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

void cblock()
{
    p("#define CONTINUATION_%_%(_name^~)|", nleft, nright, ", _l%", ", _r%");
    
    p("void _name(^~);|", "@_l%", "@_r%");
    
    p("struct _continuation_##_name{|");
    p("  void (*_apply)(void *~);|", ", _r%");
    p("  void (*_rclose)(heap, void *~);|", ", _r%");
    p("  char *name;|");
    for (int i = 0; i < nleft ; i++)  p("  _l% l%;|", i, i);
    p("};|");
    
    p("static void _apply_##_name(void *z~){|", ", _r% r%");
    p("  struct _continuation_##_name *n = z;|");
    p("  _name(^~);|", "@n->l%", "@r%");
    p("}|");

    p("struct _rcontinuation_##_name{|");
    p("  void (*rapply)(void *);|");
    p("  struct _continuation_##_name *close;|");
    for (int i = 0; i < nright ; i++) p("  _r% r%;|", i, i);
    p("};|");

    p("static void _runwrap_##_name(void *z){|");
    p("  struct _rcontinuation_##_name *n = z;|");
    p("  _name(^~);|", "@n->close->l%", "@n->r%");
    p("}|");

    p("static void _rclose_##_name(heap h, void *z~){|", ", _r% r%");
    p("  struct _rcontinuation_##_name *n = allocate(h, sizeof(struct _rcontinuation_##_name));|");
    p("  n->rapply = _runwrap_##_name;|");
    for (int i = 0; i < nright ; i++)  p("  n->r% = r%;|", i, i);    
    p("}|");

    p("static void (**_fill_##_name(struct _continuation_##_name* n, heap h^))(void *~){|", ", _l% l%", ", _r%");
    p("  n->_apply = _apply_##_name;|");
    p("  n->_rclose = _rclose_##_name;|");
    p("  n->name = #_name;|");
    for (int i = 0; i < nleft ; i++)  p("  n->l% = l%;|", i, i);
    p("  return (void (**)(void *~))n;|", ", _r%");
    p("}\n\n");
}

int main(int argc, char **argv)
{
    int lc = atoi(argv[1]);
    int rc = atoi(argv[2]);
    output = malloc(size = 1024);
    for (nleft = 0; nleft < lc; nleft++)
        for (nright = 0; nright < rc; nright++)
            cblock();
    write(1, output, fill);
}
