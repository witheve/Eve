#include <runtime.h>
#include <bswap.h>

char *map="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

string base64_encode(heap h, buffer x)
{
    string out = allocate_string(h);
    int length = buffer_length(x);
    int bcount = 0;

    while(length > 0) {
        iu32 triple = 0;
        memcpy(&triple, bref(x, bcount), (length<3?length:3));
        triple = htonl(triple);
        triple >>= 8;
        bcount += 3;

        string_insert(out, map[(triple >> 18) & 0x3f]);
        string_insert(out, map[(triple >> 12) & 0x3f]);

        if (length == 1) 
            string_insert(out, '=');
        else 
            string_insert(out, map[(triple >> 6) & 0x3f]);

        if (length < 3) 
            string_insert(out, '=');
        else 
            string_insert(out, map[triple & 0x3f]);
        length -= 3;
    }
    return(out);
}

