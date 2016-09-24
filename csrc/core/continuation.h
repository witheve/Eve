

#define closure(__x, ...) void (**__x)(void *, ## __VA_ARGS__)
#define outline_closure(...) void (**)(void *, ## __VA_ARGS__)

#define apply(__c, ...)  (*__c)(__c, ## __VA_ARGS__)

#define rclose(__h, __c, ...)\
    ((void (**)())__c)[1](__h, __c ## __VA_ARGS__)

#define cont(__h, __name, ...)\
    _fill_##__name(allocate(__h, sizeof(struct _continuation_##__name)), __h, ##__VA_ARGS__)

#define continuation_name(__x) (*(char **)((void **)(__x) + 1))
  
typedef void (**thunk)();

//extern thunk ignore;

#define name_of_cont(_c) (((char **)_c)[2])
#include <continuation_templates.h>
