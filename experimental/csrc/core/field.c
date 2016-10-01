#include <core/core.h>

typedef unsigned char word;
#define WORDLOG 3
#define WORDLEN 8

static word mask(word x){return((1<<x)-1);}

void buffer_read_field(buffer b,
                       bits offset, 
                       void *dest,
                       bits length)
{
    bits s = b->start + offset;
    word *to = dest;
    word *from = b->contents + (s>>WORDLOG);
    word x, residue=0;
    int right = (s + length)%WORDLEN;
    int left = WORDLEN-right;
    int len = 0;
    int head = (length%WORDLEN);
    int off = (s%WORDLEN);

    /*residue=*to&(~mask(head));
      we dont actually care about pre-existing bits*/

    if (head > right){
        residue |= ((*(from++)&mask(WORDLEN-off))<<right);
        len = head - right;
        if (!right) *(to++)=residue,residue=0;
    } else {
        if (right){
            x = *(from++);
            if (off != right) {
                *(to++) = ((x>>left)&mask(head))|residue;
                len = head;
            }
            residue = (x<<right)&(~mask(head));
        }
    }

    /* sigh */
    // if (len == length) *(to++)=residue;

    for (;len<length;len+=WORDLEN){
        x=*(from++);
        *(to++) = ((left<8)?(x>>left):x) | residue;
        residue = right?(x<<right):0;
    }
}

void buffer_write_field(buffer b,
                        bits offset, 
                        void *source,
                        bits length)
{
    bits s = offset + b->start;
    word *from=source;
    word *to= b->contents+(offset>>WORDLOG);
    word x,residue = 0;
    int left = (s + length)%WORDLEN;
    int right = WORDLEN-left;
    int len = 0;
    int head = (length%WORDLEN);
    int off = s%WORDLEN;

    if (off) residue = *to & (~mask(WORDLEN-off));

    if (head && (head<=left)){
        residue |= (*from&mask(head))<<right;
        from++;
        len = head;
    } else {
        if (head > left) {
            x = *(from++);
            *(to++) = ((x&(head?mask(head):(-1)))>>left)|residue;
            len = head-left;
            residue=x<<right;
        }
    }

    for (; len<(length-left) ; len+=WORDLEN){
        x = *(from++);
        *(to++) = (x>>left)|residue;
        residue = x<<right;
    }

    if (left) *to = residue|(*to&mask(right));
}



