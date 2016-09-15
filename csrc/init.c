#include <runtime.h>
#include <http/http.h>

heap init;
heap efence;

heap heap_list = 0;

thunk ignore;
static CONTINUATION_0_0(ignoro);
static void ignoro(){}

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

    heap page_allocator = init_fixed_page_region(trash, allocation_space, allocation_space + region_size, 65536);
    efence = efence_heap(4096);

    init = allocate_rolling(page_allocator, 0);
    ignore = cont(init, ignoro);
    init_unix(page_allocator);
    init_estring();
    init_uuid();

    float_heap = allocate_rolling(init_fixed_page_region(init,
                                                         float_space,
                                                         float_space + region_size,
                                                         pages->pagesize),
                                  sstring("efloat"));
}
