#include <runtime.h>
#include <unix.h>
#include <http/http.h>
#include <bswap.h>
#include <stdio.h>
#include <luanne.h>


station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init,6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}


extern void init_json_service(http_server);
extern int strcmp(const char *, const char *);
static buffer read_file_or_exit(heap, char *);

bag my_awesome_bag;

int main(int argc, char **argv)
{
    init_runtime();

    
    interpreter c = build_lua();

    for (int i = 1; i <argc ; i++) {
        if (!strcmp(argv[i], "-e")) {
            buffer b = read_file_or_exit(init, argv[++i]);
            register_implication(lua_compile_eve(c, b, true));
        }
        if (!strcmp(argv[i], "-parse")) {
            lua_run_module_func(c, read_file_or_exit(init, argv[++i]), "parser", "printParse");
            return 0;
        }
        if (!strcmp(argv[i], "-analyze")) {
            lua_run_module_func(c, read_file_or_exit(init, argv[++i]), "compiler", "analyze");
            return 0;
        }
        if (!strcmp(argv[i], "-resolve")) {
            lua_run_module_func(c, read_file_or_exit(init, argv[++i]), "implicationResolver", "testCollect");
            return 0;
        }
        if (!strcmp(argv[i],"-l")) {
            lua_run(c, read_file_or_exit(init, argv[++i]));
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

    init_json_service(h);

    printf("\n----------------------------------------------\n\nEve started. Running at http://localhost:8080\n\n");
    unix_wait();
}

buffer read_file_or_exit(heap h, char *path)
{
    buffer b = read_file(h, path);

    if (b) {
        return b;
    } else {
        printf("can't read a file: %s\n", path);
        exit(1);
    }
}
