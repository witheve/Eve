#include <runtime.h>

static void bag_update(bag deltas)
{
    bag_foreach_e(bag, e, sym(tag), sym(request), c) {
    }
}


static void init_request_service(bag b)
{
    register_delta_handler(b, closure());
}

