#include <runtime.h>
#include <bswap.h>
#include <crypto/md5.h>


typedef enum state {
    initialize,
    waiting,
    ready
} state;

typedef struct pgcolumn {
    estring name;
    estring type; /*?*/
} *pgcolumn;

typedef struct pgtable {
    estring name;
    vector columns;
} *pgtable;


typedef struct postgres {
    struct bag b;
    bag backing;
    state s;
    heap h;
    endpoint e;
    table columns;
    estring user;
    estring database;
    estring password;
    reader self;
    buffer reassembly;
    // query state
    closure(handler, vector);
    thunk query_done;
    vector signature;

    vector table_worklist;
} *postgres;

static CONTINUATION_1_0(table_complete, postgres);


static void pg_concat_estring(buffer dest, estring e)
{
    buffer_append(dest, e->body, e->length);
    buffer_write_byte(dest, 0);
}

static buffer pg_allocate_message(postgres p, byte code)
{
    buffer b = allocate_buffer(p->h, 1024);
    *(u8 *)bref(b, 0) = code;
    // reserve space for final length and message code
    b->start = b->end = 5;
    return b;
}

static void pg_send_message(postgres p, buffer b)
{
    u32 len = buffer_length(b);
    b->start = 0;
    *((u32 *)bref(b, 1)) = htonl(len + 4);
    apply(p->e->w, b, ignore);
}

static void pg_query(postgres p, string q, closure(handler, vector), thunk done)
{
    buffer b = pg_allocate_message(p, 'Q');
    buffer_append(b, bref(q,0), buffer_length(q));
    buffer_write_byte(b, 0);
    p->s = waiting;
    p->handler = handler;
    p->query_done = done;
    p->signature = allocate_vector(p->h, 10);
    pg_send_message(p, b);
};

static CONTINUATION_2_1(pg_schema_row, postgres, pgtable, vector);
static void pg_schema_row(postgres p, pgtable t, vector v)
{
    pgcolumn c = allocate(p->h, sizeof(struct pgcolumn));
    c->name = vector_get(v, 0);
    // xxx -maybe just put this guy in the edb? or both?
    vector_insert(t->columns, c);
}

static void pg_scan_schema(postgres p, estring table_name)
{
    pgtable t = allocate(p->h, sizeof(struct pgtable));
    t->columns = allocate_vector(p->h, 10);
    //  had - a.atttypmod as mod
    buffer q =
        aprintf(p->h,
                "SELECT a.attname as Column, a.atttypid as type "
                "FROM pg_catalog.pg_attribute a "
                "WHERE a.attnum > 0 "
                "AND NOT a.attisdropped "
                "AND a.attrelid = ("
                "SELECT c.oid FROM pg_catalog.pg_class c "
                "LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE c.relname = '%r')", table_name);
    pg_query(p, q, cont(p->h, pg_schema_row, p, t), cont(p->h, table_complete, p));
}

static value bool_from_thingy(buffer b)
{
    return efalse;
}

static value float_from_int(buffer b)
{
    // genericize
    int res = 0;
    string_foreach(b, i)
        res = res * 10  + i - '0';

    return box_float(res);
}


typedef value (*buffer_to_value)(buffer);

// this is hardcoded, it probably should reflect on the pg_type table, but what
// would we really do with that?
static buffer_to_value find_translator(u32 type_oid)
{
    switch(type_oid) {
    case 25:
    case 19:
    case 1043:
        return (buffer_to_value)intern_buffer;
    case 26:
        return float_from_int;
    case 23:
        return float_from_int;
    case 16:
        return bool_from_thingy;
    default:
        prf("bad pg type: %d\n", type_oid);
    }
    return(0);
}

static CONTINUATION_1_1(each_table, postgres, vector);
static void each_table(postgres p, vector v)
{
    prf ("table %v\n", vector_get(v, 0));
    vector_insert(p->table_worklist, vector_get(v, 0));
}

static CONTINUATION_2_1(table_dump_row, postgres, pgtable, vector);
static void table_dump_row(postgres p, pgtable t, vector res)
{
    uuid id = generate_uuid();
    int index;
    apply(p->backing->insert, id, sym(tag), t->name, 1, 0);
    vector_foreach(res, i)
        apply(p->backing->insert, id, vector_get(t->columns, index++), i, 1, 0);
}


static void table_dump(postgres p, pgtable t)
{
    buffer q = allocate_buffer(p->h, 10);
    boolean first = true;
    bprintf(q, "SELECT ");
    vector_foreach(t->columns, i) {
        if (!first) bprintf(q, ", ");
        first = false;
        bprintf(q, "%r", ((pgcolumn)i)->name);
    }
    pg_query(p, q, cont(p->h, pg_schema_row, p, t), cont(p->h, table_complete, p));
}

static void table_complete(postgres p)
{
    if (vector_length(p->table_worklist))
        pg_scan_schema(p, pop(p->table_worklist));
}

#define PG_SALT_LENGTH 4

static void authenticate(postgres p, buffer b)
{
    u32 code = buffer_read_be32(b);
    switch(code) {
    case 5:{
        // "md5" + print_hex(md5(print_hex(md5(password + name) + salt)))
        buffer result = allocate_buffer(p->h, 20);
        buffer m = pg_allocate_message(p, 'p');
        unsigned char inter[MD5_DIGEST_LENGTH];
        buffer k = allocate_buffer(p->h, 4);

        MD5_CTX md5;
        MD5_Init(&md5);
        MD5_Update(&md5, p->password->body, p->password->length);
        MD5_Update(&md5, p->user->body, p->user->length);
        MD5_Final(inter, &md5);
        MD5_Init(&md5);
        bprintf(result, "%X", alloca_wrap_buffer(inter, MD5_DIGEST_LENGTH));
        MD5_Update(&md5, bref(result, 0), buffer_length(result));
        MD5_Update(&md5, bref(b, 0), buffer_length(b));
        MD5_Final(inter, &md5);
        bprintf(m, "md5%X", alloca_wrap_buffer(inter, MD5_DIGEST_LENGTH));
        pg_send_message(p, m);
        break;
    }
    default:
        prf("pg auth type: %d\n", code);
    }
}

static void postgres_message(postgres p, u8 code, buffer b)
{
    switch(code) {
    // propertly list, separated by a null
    case 'S': return;
    case 'E':
        prf ("%b\n", b);
        return;

    case 'C': {
        prf("completed %s\n",bref(b, 0));
        apply(p->query_done);
        return;
    }
    // row
    case 'D': {
        u16 cols = buffer_read_be16(b);
        vector result = allocate_vector(p->h, vector_length(p->signature));
        for (int i = 0; i < cols; i++) {
            u32 len = buffer_read_be32(b);
            if (len != 0xffffffff) { // null
                buffer r = wrap_buffer(p->h, bref(b, 0), len);
                push(result, ((buffer_to_value)vector_get(p->signature, i))(r));
                b->start += len;
            }
        }
        apply(p->handler, result);
        return;
    }
    case 'R':
        authenticate(p, b);
        break;
    // row schema
    case 'T': {
        int count = buffer_read_be16(b);
        for (int i = 0; i < count; i++) {
            buffer name = allocate_buffer(p->h, 10);
            character x;
            while ((x = buffer_read_byte(b)))
                buffer_write_byte(name, x);

            u32 oid = buffer_read_be32(b);
            u16 col = buffer_read_be16(b);
            u32 type_oid = buffer_read_be32(b);
            u16 type_length = buffer_read_be16(b);
            u32 type_mod = buffer_read_be32(b);
            u16 field_format = buffer_read_be16(b);
            vector_insert(p->signature, find_translator(type_oid));
        }
    }

    case 'Z':
        if (p->s == initialize) {
            pg_query(p,
                     aprintf(p->h, "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"),
                     cont(p->h, each_table, p),
                     cont(p->h, table_complete, p));
        } else p->s = ready;
        return;
    default:
        prf("message %c %X\n", code, b);
    }
}

static CONTINUATION_1_2(postgres_input, postgres, buffer, register_read);
static void postgres_input(postgres p, buffer in, register_read reg)
{
    if (in) {
        if (!p->reassembly) {
            p->reassembly = in;
            in = 0;
        }

        while (p->reassembly) {
            buffer r = p->reassembly;
            if (buffer_length(r) < 5) return;

            u8 code = buffer_read_byte(r);
            u32 length = buffer_read_be32(r);
            r->start -= 5;
            if (buffer_length(r) < length) return;
            postgres_message(p, code, wrap_buffer(p->h, bref(r, 5), length - 4));
            r->start += length + 1;
            if (r->start == r->end)  p->reassembly = 0;
        }
        apply(reg, p->self);
    } else prf("pg shutdown\n");
}

static CONTINUATION_1_1(postgres_connected, postgres, endpoint);
static void postgres_connected(postgres p, endpoint e)
{
    prf ("connected\n");
    p->e = e;
    p->reassembly = 0;
    buffer b = allocate_buffer(p->h, 256);
    u32 version = 0x30000;
    buffer_write_be32(b, 0); // length
    buffer_write_be32(b, version);
    pg_concat_estring(b, sym(user));
    pg_concat_estring(b, p->user);
    pg_concat_estring(b, sym(database));
    pg_concat_estring(b, p->database);
    buffer_write_byte(b, 0);
    *(u32 *)bref(b, 0) = htonl(buffer_length(b));
    p->self = cont(p->h, postgres_input, p);
    apply(e->w, b, ignore);
    apply(e->r, p->self);
}

bag connect_postgres(station s, estring user, estring password, estring database)
{
    heap h = allocate_rolling(pages, sstring("postgres"));
    postgres p = allocate(h, sizeof(struct postgres));
    p->h = h;
    p->s = initialize;
    p->user = user;
    p->password = password;
    p->database = database;
    p->table_worklist = allocate_vector(p->h, 10);
    tcp_create_client(h, s, cont(h, postgres_connected, p));
    return (bag)p;
}
