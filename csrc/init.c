#include <runtime.h>

eboolean efalse;
eboolean etrue;

heap init;
heap pages;

void init_runtime()
{
    pages = init_memory(131072);
    init = allocate_rolling(pages);

    efalse = allocate(init, 1);
    etrue = allocate(init, 1);
    // from type.h
    // should be in the right typespace
    *(unsigned char *)etrue = 1;
    *(unsigned char *)efalse = 0;
    init_string();
    void init_uuid();
}


    
