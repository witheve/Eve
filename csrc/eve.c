#include <runtime.h>
#include <http/http.h>
#include <bswap.h>
#include <luanne.h>

static boolean enable_tracing = false;
static buffer loadedParse;
static char *exec_path;
static int port = 8080;
static buffer server_eve = 0;
// defer these until after everything else has been set up
static vector tests;

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


extern void init_json_service(http_server, uuid, boolean, buffer, char*);
extern int strcmp(const char *, const char *);
static buffer read_file_or_exit(heap, char *);

// @FIXME: Once we abstract the terminal behind a session, we no longer need a special-cased error handler.
// See `send_error` in json_request.c
static void send_error_terminal(heap h, char* message, bag data, uuid data_id)
{
    void * address = __builtin_return_address(1);
    string stack = allocate_string(h);
    get_stack_trace(&stack);

    prf("ERROR: %s\n  stage: executor\n  offsets:\n%b", message, stack);

    if(data != 0) {
      string data_string = edb_dump(h, (edb)data);
      prf("  data: ⦑%v⦒\n%b", data_id, data);
    }
    destroy(h);
}
static CONTINUATION_0_3(handle_error_terminal, char *, bag, uuid);
static void handle_error_terminal(char * message, bag data, uuid data_id) {
    heap h = allocate_rolling(pages, sstring("error handler"));
    send_error_terminal(h, message, data, data_id);
}


static CONTINUATION_1_2(test_result, heap, table, table);
static void test_result(heap h, table s, table c)
{
    if (s) {
        table_foreach(s, n, v) {
            prf("result: %v %b\n", n, edb_dump(h, (edb)v));
        }
    } else prf("result: empty\n");
}

static void run_test(bag root, buffer b, boolean tracing)
{
    heap h = allocate_rolling(pages, sstring("command line"));
    bag troot =  (bag)create_edb(h, generate_uuid(), 0);
    bag remote = (bag)create_edb(h, generate_uuid(), 0);
    // todo - reduce the amount of setup required here
    bag event = (bag)create_edb(h, generate_uuid(), 0);
    bag session = (bag)create_edb(h, generate_uuid(), 0);
    bag fb = filebag_init(sstring("."), generate_uuid());
    
    table scopes = create_value_table(h);
    table_set(scopes, intern_cstring("all"), troot->u);
    table_set(scopes, intern_cstring("session"), session->u);
    table_set(scopes, intern_cstring("event"), event->u);
    table_set(scopes, intern_cstring("remote"), remote->u);
    table_set(scopes, intern_cstring("file"), fb->u);

    table persisted = create_value_table(h);
    table_set(persisted, troot->u, troot);
    table_set(persisted, session->u, session);
    table_set(persisted, fb->u, fb);
    table_set(persisted, remote->u, remote);

    init_request_service(troot);
    buffer desc;
    vector n = compile_eve(h, b, tracing, &desc);
    vector_foreach(n, i)
        table_set(session->implications, i, (void *)1);

    evaluation ev = build_evaluation(scopes, persisted, cont(h, test_result, h), cont(h, handle_error_terminal));
    inject_event(ev, aprintf(h,"init!\n```\nbind\n      [#test-start]\n```"), tracing);
    //    destroy(h); everything asynch is running here!
}



typedef struct command {
    char *single, *extended, *help;
    boolean argument;
    void (*f)(interpreter, char *, bag);
} *command;

static void do_port(interpreter c, char *x, bag b)
{
    port = atoi(x);
}

static void do_tracing(interpreter c, char *x, bag b)
{
    enable_tracing = true;
}

static void do_parse(interpreter c, char *x, bag b)
{
    lua_run_module_func(c, read_file_or_exit(init, x), "parser", "printParse");
}

static void do_analyze(interpreter c, char *x, bag b)
{
    lua_run_module_func(c, read_file_or_exit(init, x), "compiler", "analyzeQuiet");
}

static void do_run_test(interpreter c, char *x, bag b)
{
    vector_insert(tests, x);
}

static CONTINUATION_0_1(end_read, reader);
static void end_read(reader r)
{
    apply(r, 0, 0);
}

static CONTINUATION_0_2(dumpo, bag, uuid);
static void dumpo(bag b, uuid u)
{
    if (b) prf("%b", edb_dump(init, (edb)b));
}

// should actually merge into bag
static void do_json(interpreter c, char *x, bag b)
{
    buffer f = read_file_or_exit(init, x);
    reader r = parse_json(init, cont(init, dumpo));
    apply(r, f, cont(init, end_read));
}

static void do_exec(interpreter c, char *x, bag b)
{
    buffer desc;
    buffer f = read_file_or_exit(init, x);
    exec_path = x;
    vector v = compile_eve(init, f, enable_tracing, &loadedParse);
    vector_foreach(v, i)
        table_set(b->implications, i, (void *)1);
}

static void do_server_eve(interpreter c, char *x, bag b)
{
    server_eve = read_file_or_exit(init, x);
}

static command commands;

static void print_help(interpreter c, char *x, bag b);

static struct command command_body[] = {
    {"p", "parse", "parse and print structure", true, do_parse},
    {"a", "analyze", "parse order print structure", true, do_analyze},
    {"r", "run", "execute eve", true, do_run_test},
    //    {"s", "serve", "serve urls from the given root path", true, 0},
    {"S", "seve", "use the subsequent eve file to serve http requests", true, do_server_eve},
    {"e", "exec", "read eve file and serve", true, do_exec},
    {"P", "port", "serve http on passed port", true, do_port},
    {"h", "help", "print help", false, print_help},
    {"j", "json", "source json object from file", true, do_json},
    {"t", "tracing", "enable per-statement tracing", false, do_tracing},
    //    {"R", "resolve", "implication resolver", false, 0},
};

static void print_help(interpreter c, char *x, bag b)
{
    for (int j = 0; (j < sizeof(command_body)/sizeof(struct command)); j++) {
        command c = &commands[j];
        prf("-%s --%s %s\n", c->single, c->extended, c->help);
    }
    exit(0);
}

int main(int argc, char **argv)
{
    init_runtime();
    bag root = (bag)create_edb(init, generate_uuid(), 0);
    interpreter interp = build_lua();
    commands = command_body;
    boolean dynamicReload = true;
    tests = allocate_vector(init, 5);

    //    init_request_service(root);

    for (int i = 1; i < argc ; i++) {
        command c = 0;
        for (int j = 0; !c &&(j < sizeof(command_body)/sizeof(struct command)); j++) {
            command d = &commands[j];
            if (argv[i][0] == '-') {
                if (argv[i][1] == '-') {
                    if (!strcmp(argv[i]+2, d->extended)) c = d;
                } else {
                    if (!strcmp(argv[i]+1, d->single)) c = d;
                }
            }
        }
        if (c) {
            c->f(interp, argv[i+1], root);
            if (c->argument) i++;
        } else {
            do_exec(interp, argv[i], root);
            // prf("\nUnknown flag %s, aborting\n", argv[i]);
            // exit(-1);
        }
    }

    http_server h = create_http_server(create_station(0, port), server_eve);
    register(h, "/", "text/html", index);
    register(h, "/jssrc/renderer.js", "application/javascript", renderer);
    register(h, "/jssrc/microReact.js", "application/javascript", microReact);
    register(h, "/jssrc/codemirror.js", "application/javascript", codemirror);
    register(h, "/jssrc/codemirror.css", "text/css", codemirrorCss);
    register(h, "/examples/todomvc.css", "text/css", exampleTodomvcCss);

    // TODO: figure out a better way to manage multiple graphs
    init_json_service(h, root, enable_tracing, loadedParse, exec_path);

    prf("\n----------------------------------------------\n\nEve started. Running at http://localhost:%d\n\n",port);

    vector_foreach(tests, t)
        run_test(root, read_file_or_exit(init, t), enable_tracing);

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
