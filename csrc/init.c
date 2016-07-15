#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>

heap init;
heap pages;
heap efence;

heap heap_list = 0;

void heap_report()
{
    for ( heap i = heap_list; i ; i=i->next) {
        prf ("%b %dk\n", i->name?i->name: sstring("init"), i->allocated/1024);
    }
}


void init_runtime()
{
    // bootstrap
    heap trash = init_memory(4096);
    
    pages = init_fixed_page_region(trash, allocation_space, allocation_space + region_size, 65536);
    efence = efence_heap(4096);

    init = allocate_rolling(pages, 0);

    initialize_timers(allocate_rolling(pages, sstring("timers")));
    init_estring();
    init_uuid();
    init_unix();
    float_heap = allocate_rolling(init_fixed_page_region(init, float_space, float_space + region_size, pages->pagesize),
                                  sstring("efloat"));
}


    
