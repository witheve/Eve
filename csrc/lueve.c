#include <runtime.h>
#include <unix.h>
#include <http/http.h>
#include <bswap.h>
#include <luanne.h>



station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init,6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}


extern void init_json_service(http_server, bag, boolean);
extern int strcmp(const char *, const char *);
static buffer read_file_or_exit(heap, char *);


static void run_test(bag root, buffer b, boolean tracing)
{
    heap h = allocate_rolling(pages);
    bag event = create_bag(generate_uuid());
    table scopes = create_value_table(h);
    table results = create_value_vector_table(h);
    table_set(scopes, intern_cstring("history"), root);
    table_set(scopes, intern_cstring("event"), event);
    table_set(scopes, intern_cstring("transient"), event);
    
    // take this from a pool
    interpreter c = build_lua(root, scopes);
    node n = lua_compile_eve(c, b, tracing);
    edb_register_implication(event, n);
    table persisted = create_value_table(h);
    table result_bags = start_fixedpoint(h, scopes, persisted);
    table_foreach(result_bags, n, v) {
        prf("%v %b\n", n, bag_dump(h, v));
    }
    h->destroy(h);
}

int main(int argc, char **argv)
{
    init_runtime();
    bag root = create_bag(generate_uuid());
    boolean enable_tracing = false;
    
    interpreter c = build_lua();

    for (int i = 1; i <argc ; i++) {
        if (!strcmp(argv[i], "-r")) {
            buffer b = read_file_or_exit(init, argv[++i]);
            run_test(root, b, enable_tracing);
        }
        if (!strcmp(argv[i], "-e")) {
            buffer b = read_file_or_exit(init, argv[++i]);
            edb_register_implication(root, lua_compile_eve(c, b, enable_tracing));
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
        if (!strcmp(argv[i],"-t")) {
            enable_tracing = true;
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

    init_json_service(h, root, enable_tracing);

    prf("\n----------------------------------------------\n\nEve started. Running at http://localhost:8080\n\n");
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
