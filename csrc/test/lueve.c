#include <runtime.h>
#include <unix.h>
#include <http/http.h>


station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init,6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}

int main(int argc, char **argv)
{
    init_runtime();
    interpreter c = build_lua();
    if (argc > 1) {
        lua_run_file(c, argv[1]);
    }
    http_server h = create_http_server(init, create_station(0, 8080));
    extern void *index_start, * index_end;
    register_static_content(h, "/", wrap_buffer(init, index_start,
                                                index_end - index_start));


    extern void * renderer_start, *renderer_end;
    register_static_content(h, "/render.js", wrap_buffer(init,  renderer_start,
                                                         renderer_end -  renderer_start));
    unix_wait();
}
