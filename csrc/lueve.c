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

int atoi( const char *str );

station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init,6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}


extern void init_json_service(http_server, uuid, boolean, buffer);
extern int strcmp(const char *, const char *);
static buffer read_file_or_exit(heap, char *);

extern void *ignore;

static CONTINUATION_1_2(test_result, heap, table, table);
static void test_result(heap h, table s, table c)
{
    table_foreach(s, n, v) {
        prf("%v %b\n", n, bag_dump(h, v));
    }
    destroy(h);
}

static void run_test(bag root, buffer b, boolean tracing)
{
    heap h = allocate_rolling(pages, sstring("command line"));
    bag event = create_bag(h, generate_uuid());
    table scopes = create_value_table(h);
    table results = create_value_vector_table(h);
    table_set(scopes, intern_cstring("all"), root);
    table_set(scopes, intern_cstring("session"), event);
    table_set(scopes, intern_cstring("transient"), event);

    buffer desc;
    vector n = compile_eve(h, b, tracing, &desc);
    vector_foreach(n, i)
        edb_register_implication(event, i);
    table persisted = create_value_table(h);
    evaluation ev = build_evaluation(scopes, persisted, cont(h, test_result, h));
    run_solver(ev);
    destroy(h);
}

int main(int argc, char **argv)
{
    init_runtime();
    bag root = create_bag(init, generate_uuid());
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
    buffer desc = 0;
    int port = 8080;

    
    char * file = "";
    for (int i = 1; i < argc ; i++) {
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
        else if (!strcmp(argv[i], "--port") || !strcmp(argv[i], "-P")) {
            // TODO Some sort of type checking here?
            port = atoi(argv[++i]);
        }
        else if (!strcmp(argv[i], "--help") || !strcmp(argv[i], "-h")) {
            printf("\nUsage: eve [OPTIONS] [arg ...]\n\n"
            "Starts the Eve server.\n\n" 
            "Options:\n\n" 
            "  -h, --help \t\t Prints what you are reading now.\n"
            "  -p, --parse \t\t Does something.\n"
            "  -a, --analyze \t Does something.\n"
            "  -A, --analyze-quiet \t Does something, but quietly\n"
            "  -r, --TODO \t\t Does something.\n"
            "  -e, --exec \t\t Does something.\n"
            "  -P, --port \t\t Sets the port on which Eve is hosted.\n"
            "\n");
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
        vector v = compile_eve(init, b, enable_tracing, &desc);
        vector_foreach(v, i) {
            edb_register_implication(root, i);
        }
    }
    else {
        return 0;
    }
    
    http_server h = create_http_server(init, create_station(0, port));
    register(h, "/", "text/html", index);
    register(h, "/jssrc/renderer.js", "application/javascript", renderer);
    register(h, "/jssrc/microReact.js", "application/javascript", microReact);
    register(h, "/jssrc/codemirror.js", "application/javascript", codemirror);
    register(h, "/jssrc/codemirror.css", "text/css", codemirrorCss);

    // TODO: figure out a better way to manage multiple graphs
    init_json_service(h, root, enable_tracing, desc);

    prf("\n----------------------------------------------\n\nEve started. Running at http://localhost:%d\n\n",port);
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