#include <runtime.h>
#include <bswap.h>

station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init, 6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}
