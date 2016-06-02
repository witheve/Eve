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

extern int strcmp(const char *, const char *);
int main(int argc, char **argv)
{
    init_runtime();
    interpreter c = build_lua();
    for (int i = 1; i <argc ; i++) {
        if (!strcmp(argv[i], "-e")) {
            lua_run_eve(c, read_file(init, argv[++i]));
        }
        if (!strcmp(argv[i],"-l")) {
            lua_run(c, read_file(init, argv[++i]));
        }
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

    printf("\n----------------------------------------------\n\nEve started. Running at http://localhost:8080\n\n");
    unix_wait();
}
