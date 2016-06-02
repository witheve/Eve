#include <runtime.h>
#include <unix.h>
#include <http/http.h>
#include <bswap.h>


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
        buffer b = read_file(init, argv[1]);
        lua_run(c, b);
    }
    http_server h = create_http_server(init, create_station(0, 8080));
    extern unsigned char index_start, index_end;
    register_static_content(h, "/", "text/html", wrap_buffer(init, &index_start,
                                                             &index_end - &index_start));
    
    
    extern unsigned char renderer_start, renderer_end;
    register_static_content(h, "/jssrc/renderer.js",
                            "application/javascript",
                            wrap_buffer(init,  &renderer_start,
                                        &renderer_end -  &renderer_start));
    unix_wait();
}
