#include <runtime.h>
#include <unix.h>
#include <http/http.h>
#include <bswap.h>
#include <luanne.h>

#define register(__h, __url, __content, __name)\
 {\
    extern unsigned char __name##_start, __name##_end;\
    unsigned char *s = &__name##_start, *e = &__name##_end;\
    register_static_content(__h, __url, __content, wrap_buffer(init, s, e-s), dynamicReload?(char *)e:0); \
 }


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

extern void *ignore;

static void run_test(bag root, buffer b, boolean tracing)
{
    heap h = allocate_rolling(pages);
    bag event = create_bag(generate_uuid());
    table scopes = create_value_table(h);
    table results = create_value_vector_table(h);
    table_set(scopes, intern_cstring("all"), root);
    table_set(scopes, intern_cstring("session"), event);
    table_set(scopes, intern_cstring("transient"), event);

    vector n = compile_eve(b, tracing);
    vector_foreach(n, i)
        edb_register_implication(event, i);
    table persisted = create_value_table(h);
    table counts = allocate_table(h, key_from_pointer, compare_pointer);
    evaluation s = build_evaluation(h, scopes, persisted, counts);
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
    boolean dynamicReload = true;
    boolean has_non_exec_action = false;
    
    char * file = "";
    for (int i = 1; i <argc ; i++) {
        if (!strcmp(argv[i], "--parse") || !strcmp(argv[i], "-p")) {
            doParse = true;
            consumeFile = true;
            has_non_exec_action = true;
        }
        else if (!strcmp(argv[i], "--analyze") || !strcmp(argv[i], "-a")) {
            doAnalyze = true;
            consumeFile = true;
            has_non_exec_action = true;
        }
        else if (!strcmp(argv[i], "--analyze-quiet") || !strcmp(argv[i], "-A")) {
          doAnalyzeQuiet = true;
          consumeFile = true;
          has_non_exec_action = true;
        }
        else if (!strcmp(argv[i], "-r")) {
            doRead = true;
            consumeFile = true;
            has_non_exec_action = true;
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
            } else if(!has_non_exec_action) {
                doExec = true;
                file = argv[i];
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
        vector v = compile_eve(b, enable_tracing);
        vector_foreach(v, i) {
            edb_register_implication(root, i);
        }
    }
    else {
        return 0;
    }
    
    http_server h = create_http_server(init, create_station(0, 8080));
    register(h, "/", "text/html", index);
    register(h, "/jssrc/renderer.js", "application/javascript", renderer);
    register(h, "/jssrc/microReact.js", "application/javascript", microReact);
    register(h, "/jssrc/codemirror.js", "application/javascript", codemirror);
    register(h, "/jssrc/codemirror.css", "text/css", codemirrorCss);

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
