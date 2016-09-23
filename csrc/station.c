#include <runtime.h>
#include <bswap.h>

heap station_region, station_heap;

station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(station_heap, 6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}

station ip_wildcard;

void init_station()
{
    heap station_region = init_fixed_page_region(init,
                                                 station_space, 
                                                 station_space + region_size,
                                                 pages->pagesize,
                                                 false);
    station_heap = allocate_rolling(station_region, sstring("stations"));
    ip_wildcard = create_station(0, 0);
}
