#include <runtime.h>
#include <http/http.h>
#include <bswap.h>
#include <luanne.h>

static boolean enable_tracing = false;
static char *exec_path;
static int port = 8080;
static bag static_bag;
static bag env_bag;
static int default_behaviour = true;

//filesystem like tree namespace
#define register(__bag, __url, __content, __name)\
 {\
    extern unsigned char __name##_start, __name##_end;\
    unsigned char *s = &__name##_start, *e = &__name##_end;\
    uuid n = generate_uuid();\
    apply(__bag->insert, e, sym(url), sym(__url), 1, 0);           \
    apply(__bag->insert, e, sym(body), intern_string(s, e-s), 1, 0);       \
    apply(__bag->insert, e, sym(content-type), sym(__content_type), 1, 0); \
 }

int atoi( const char *str );

station create_station(unsigned int address, unsigned short port) {
    void *a = allocate(init,6);
    unsigned short p = htons(port);
    memset(a, 0, 6);
    memcpy (a+4, &p, 2);
    return(a);
}


extern void init_json_service(http_server, uuid, boolean, bag, char*);
extern int strcmp(const char *, const char *);
static buffer read_file_or_exit(heap, char *);

// @FIXME: Once we abstract the terminal behind a session, we no longer need a special-cased error handler.
// See `send_error` in json_request.c
static void send_error_terminal(heap h, char* message, bag data, uuid data_id)
{
    void * address = __builtin_return_address(1);
    string stack = allocate_string(h);
    // xxx - figure out why stack trace is busted :/
    //    get_stack_trace(&stack);

    prf("ERROR: %s\n  stage: executor\n", message);

    if(data != 0) {
      string data_string = edb_dump(h, (edb)data);
      prf("  data: ⦑%v⦒\n%b", data_id, data_string);
    }
    destroy(h);
}

static CONTINUATION_0_3(handle_error_terminal, char *, bag, uuid);
static void handle_error_terminal(char * message, bag data, uuid data_id) {
    heap h = allocate_rolling(pages, sstring("error handler"));
    send_error_terminal(h, message, data, data_id);
}

extern void *db_start, *db_end;
bag staticdb()
{
    edb e = create_edb(init, 0);
    buffer_handler n = deserialize_into_bag(init, (bag)e);
    apply(n, wrap_buffer(init, &db_start, ((u64)&db_end) - ((u64)&db_start)), ignore);
    return (bag)e;
}

// with the input/provides we can special case less of this
// this really gets folded in with run_test and just becomes boot-with-eve
static void start_http_server(buffer source)
{
    heap h = allocate_rolling(pages, sstring("command line"));
    table scopes = create_value_table(h);
    table persisted = create_value_table(h);
    bag compiler_bag;

    process_bag pb  = process_bag_init(persisted);
    uuid pid = generate_uuid();
    table_set(persisted, pid, pb);

    bag fb = (bag)filebag_init(sstring(pathroot));
    uuid fid = generate_uuid();
    table_set(persisted, fid, fb);

    uuid sid = generate_uuid();
    table_set(persisted, sid, static_bag);

    table_set(scopes, sym(file), fid);
    table_set(scopes, sym(process), pid);
    table_set(scopes, sym(static), sid);

    heap hc = allocate_rolling(pages, sstring("eval"));
    vector n = compile_eve(h, source, false, &compiler_bag);
    evaluation ev = build_evaluation(h, sym(http-server), scopes, persisted, ignore, cont(h, handle_error_terminal), n);
    create_http_server(create_station(0, port), ev, pb);
    prf("\n----------------------------------------------\n\nEve started. Running at http://localhost:%d\n\n",port);
}

static void run_eve_http_server(char *x)
{
    buffer b = read_file_or_exit(init, x);
    default_behaviour = false;
    start_http_server(b);
}

typedef struct command {
    char *single, *extended, *help;
    boolean argument;
    void (*f)(char *);
} *command;

static void do_port(char *x)
{
    port = atoi(x);
}

static void do_tracing(char *x)
{
    enable_tracing = true;
}

static void do_parse(char *x)
{
    interpreter c = get_lua();
    lua_run_module_func(c, read_file_or_exit(init, x), "parser", "printParse");
    default_behaviour = false;
    free_lua(c);
}

static void do_analyze(char *x)
{
    interpreter c = get_lua();
    lua_run_module_func(c, read_file_or_exit(init, x), "compiler", "analyzeQuiet");
    default_behaviour = false;
    free_lua(c);
}

// xxx - this should really be a bag creation function, once we get our function
// and first class bag story straight
static void do_db(char *x)
{
    buffer args = wrap_buffer(init, x, cstring_length(x));
    vector n = split(init, args, ':');
    // wrap environment
    estring user;
    edb_foreach_ev((edb)env_bag, e, sym(USER), v, m)
        user = v;
    estring password = sym();
    int len = vector_length(n);

    if (len > 0)  user = vector_get(n, 0);
    estring database = user;    
    if (len > 1)  password = vector_get(n, 1);
    if (len > 2)  database = vector_get(n, 2);    

    station s = station_from_string(init, sstring("127.0.0.1:5432"));
    bag b = connect_postgres(s, sym(yuri), sym(), sym(yuri));
}

static command commands;

static void print_help(char *x);

static struct command command_body[] = {
    {"p", "parse", "parse and print structure", true, do_parse},
    {"d", "db", "connect to postgres", true, do_db},
    {"a", "analyze", "parse order print structure", true, do_analyze},
    {"s", "serve", "use the subsequent eve file to serve http requests", true, run_eve_http_server},
    {"P", "port", "serve http on passed port", true, do_port},
    {"h", "help", "print help", false, print_help},
    {"t", "tracing", "enable per-statement tracing", false, do_tracing},
    //    {"R", "resolve", "implication resolver", false, 0},
};

static void print_help(char *x)
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
    bag root = (bag)create_edb(init, 0);
    commands = command_body;
    static_bag = staticdb();
    env_bag = env_init();

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
            c->f(argv[i+1]);
            if (c->argument) i++;
        } else {
            prf("\nUnknown flag %s, aborting\n", argv[i]);
            exit(-1);
        }
    }

    // depends on uuid layout, package.c, and other fragilizites
    unsigned char fixed_uuid[12] = {0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1};
    estring static_server = lookupv((edb)static_bag, intern_uuid(fixed_uuid), sym(server));
    if (default_behaviour)
        start_http_server(alloca_wrap_buffer(static_server->body, static_server->length));

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
