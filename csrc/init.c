#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>

heap init;
heap pages;
heap efence;

void init_runtime()
{
    // bootstrap
    heap trash = init_memory(4096);
    
    pages = init_fixed_page_region(trash, allocation_space, allocation_space + region_size, 4096);
    efence = efence_heap(4096);

    init = allocate_rolling(pages);

    initialize_timers(allocate_rolling(pages));
    init_estring();
    init_uuid();
    init_unix();
    float_heap = allocate_rolling(init_fixed_page_region(init, float_space, float_space + region_size, pages->pagesize));
}


    
