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
    table_set(scopes, intern_cstring("all"), root);
    table_set(scopes, intern_cstring("session"), event);
    table_set(scopes, intern_cstring("transient"), event);

    node n = compile_eve(b, tracing);
    edb_register_implication(event, n);
    table persisted = create_value_table(h);
    table counts = allocate_table(h, key_from_pointer, compare_pointer);
    solver s = build_solver(h, scopes, persisted, counts);
    run_solver(s);
    
    table_foreach(s->solution, n, v) {
        prf("%v %b\n", n, bag_dump(h, v));
    }
    destroy(h);
}

int main(int argc, char **argv)
{
    init_runtime();
    bag root = create_bag(generate_uuid());
    boolean enable_tracing = false;
    interpreter c = build_lua();

    boolean doParse = false;
    boolean doAnalyze = false;
    boolean doAnalyzeQuiet = false;
    boolean doExec = false;
    boolean doRead = false;
    boolean consumeFile = false;
    char * file = "";
    for (int i = 1; i <argc ; i++) {
        if (!strcmp(argv[i], "--parse") || !strcmp(argv[i], "-p")) {
            doParse = true;
            consumeFile = true;
        }
        else if (!strcmp(argv[i], "--analyze") || !strcmp(argv[i], "-a")) {
            doAnalyze = true;
            consumeFile = true;
        }
        else if (!strcmp(argv[i], "--analyze-quiet") || !strcmp(argv[i], "-A")) {
          doAnalyzeQuiet = true;
          consumeFile = true;
        }
        else if (!strcmp(argv[i], "-r")) {
            doRead = true;
            consumeFile = true;
        }
        else if (!strcmp(argv[i], "--exec") || !strcmp(argv[i], "-e")) {
            doExec = true;
            consumeFile = true;
        }
        else {
            if (!strcmp(argv[i], "--resolve")) {
                lua_run_module_func(c, read_file_or_exit(init, argv[++i]), "implicationResolver", "testCollect");
                return 0;
            }
            else if (!strcmp(argv[i],"-l")) {
                lua_run(c, read_file_or_exit(init, argv[++i]));
            }
            else if (!strcmp(argv[i],"-t")) {
                enable_tracing = true;
            }
            else if (consumeFile) {
                file = argv[i];
            }
            else {
                prf("\nUnknown flag %s, aborting", argv[i]);
                return -1;
            }
            consumeFile = false;
        }
    }

    if (doParse) {
        lua_run_module_func(c, read_file_or_exit(init, file), "parser", "printParse");
    }
    if (doAnalyze) {
        lua_run_module_func(c, read_file_or_exit(init, file), "compiler", "analyze");
    } else if (doAnalyzeQuiet) {
        lua_run_module_func(c, read_file_or_exit(init, file), "compiler", "analyzeQuiet");
    }
    if (doRead) {
        buffer b = read_file_or_exit(init, file);
        run_test(root, b, enable_tracing);
    }
    if (doExec) {
        buffer b = read_file_or_exit(init, file);
        edb_register_implication(root, lua_compile_eve(c, b, enable_tracing));
    }
    else {
        return 0;
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

    extern unsigned char microReact_start, microReact_end;
    register_static_content(h, "/jssrc/microReact.js",
                            "application/javascript",
                            wrap_buffer(init,  &microReact_start,
                                        &microReact_end -  &microReact_start));

    extern unsigned char codemirror_start, codemirror_end;
    register_static_content(h, "/jssrc/codemirror.js",
                            "application/javascript",
                            wrap_buffer(init,  &codemirror_start,
                                        &codemirror_end -  &codemirror_start));

    extern unsigned char codemirrorCss_start, codemirrorCss_end;
    register_static_content(h, "/jssrc/codemirror.css",
                            "text/css",
                            wrap_buffer(init,  &codemirrorCss_start,
                                        &codemirrorCss_end -  &codemirrorCss_start));

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
