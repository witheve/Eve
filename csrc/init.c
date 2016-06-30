#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>

eboolean efalse;
eboolean etrue;

heap init;
heap pages;
heap efence;

void init_runtime()
{
    pages = init_memory(131072);
    efence = efence_heap(4096);

    init = allocate_rolling(pages);

    efalse = allocate(init, 1);
    etrue = allocate(init, 1);
    // from type.h
    // should be in the right typespace
    *(unsigned char *)etrue = 1;
    *(unsigned char *)efalse = 0;
    initialize_timers(allocate_rolling(pages));
    init_string();
    init_uuid();
    select_init();
    init_processes();
    float_heap = init_fixed_page_region(init, float_space, float_space + region_size, pages->pagesize);
}


    
