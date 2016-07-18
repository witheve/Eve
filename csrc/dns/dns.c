#include <core/core.h>
#include <unix/unix.h>
#include <dns/dns.h>


#define OPCODE_STANDARD 0
#define OPCODE_INVERSE 1
#define OPCODE_STATUS 2

#define IN_CLASS 1

typedef struct request {
    int type;
    closure(result, buffer);
    u64 id;
} *request;

typedef struct resolver {
    buffer_handler write;
    table request_map;
    unsigned int correlator;
    station server;
    heap h;
    udp u;
} *resolver;

static string scan_label(heap h, buffer b)
{
    int len;
    string out = allocate_string(h);
    int count = 0;
    while ((len = buffer_read_byte(b)) > 0) {
        if (len & 0xc0) {
            buffer_read_byte(b);
            return(sstring("[offset]"));
        }
        int i;
        if (count++) buffer_write_byte(out, '.');
        buffer_write(out, bref(b,0), len);
        buffer_consume(b, len);
    }
    return(out);
}

static boolean scan_rr(heap h, buffer b, request r)
{
    string n = scan_label(init, b);
    u16 type = buffer_read_be16(b);
    u16 class = buffer_read_be16(b);
    u32 ttl = buffer_read_be32(b);

    int rdlen = buffer_read_be16(b)*8;
    buffer rd = allocate_buffer(init, rdlen);
    buffer_read(b, bref(rd, 0), rdlen);
    buffer_produce(rd, rdlen);
    
    // A record and inet class
    if ((type == r->type) && (class == IN_CLASS)) {
        buffer out = (void *)0;
        // quad a?
        if (type == DNS_TYPE_A) {
            u32 out = buffer_read_be32(b);
            // translate to a station
        }
        if (type == DNS_TYPE_PTR) {
            out = scan_label(h, rd);
        }
        apply(r->result, out);
        return(true);
    }
    return(false);
}

static CONTINUATION_1_2(dns_input, resolver, station, buffer);
static void dns_input(resolver r, station a, buffer input)
{
    u64 id = buffer_read_be16(input);
    request x = table_find(r->request_map, (void *)id);
    if (!x) return;

    table_set(r->request_map, (void *)id, (void *)0);
    u16 control = buffer_read_be16(input);

    if (control & 0xf) {
        apply(x->result, false);
        return;
    }
    
    int qd = buffer_read_be16(input);
    int an = buffer_read_be16(input);
    int ns = buffer_read_be16(input);
    int ar = buffer_read_be16(input);

    int i;
    for (i = 0; i< qd; i++) {
        scan_label(init, input);
        buffer_read_be16(input);
        buffer_read_be16(input);
    }

    boolean ret = false;
    for (i = 0; (i < an) && !ret; i++)
        ret = scan_rr(r->h, input, x);

    for (i = 0; (i < ns) && !ret; i++)
        ret = scan_rr(r->h, input, x);

    for (i = 0; (i < ar) && !ret; i++) 
        ret = scan_rr(r->h, input, x);

    if (!ret) apply(x->result, false);
}

static CONTINUATION_2_0(timeout, resolver, request);
static void timeout(resolver r, request rq)
{
    if (table_find(r->request_map, (void *)rq->id)) {
        table_set(r->request_map, (void *)rq->id, 0);
        apply(rq->result, false);
    }
}


static void dns_resolve(resolver r, 
                        int kind,
                        string hostname, 
                        closure(complete, buffer))
{
    buffer b = allocate_buffer(r->h, 1024);
    u64 id = r->correlator++;
    request rq = allocate(r->h, sizeof(struct request));
    rq->result = complete;
    rq->id = id;

    if (kind == DNS_TYPE_MX) rq->type = DNS_TYPE_A;
    if (kind == DNS_TYPE_A) rq->type = DNS_TYPE_A;
    if (kind == DNS_TYPE_PTR) rq->type = DNS_TYPE_PTR;
    
    table_set(r->request_map, (void *)id, rq);

    // we really want to use the binary templates
    buffer_write_be16(b, id);
    int recursive_desired = 1;
    buffer_write_be16(b, (recursive_desired<<7) | (OPCODE_STANDARD << 1));
    buffer_write_be16(b, 1);
    buffer_write_be16(b, 0);
    buffer_write_be16(b, 0);
    buffer_write_be16(b, 0);

    //    string i;
    //    string_foreach(i, split(hostname, '.'))
    //        push_string(b, i);

    //push_string(b, sstring(""));
    buffer_write_be16(b, kind);
    buffer_write_be16(b, IN_CLASS);

    udp_write(r->u, r->server, b);
    register_timer(seconds(5), cont(r->h, timeout, r, rq));
}

resolver allocate_resolver(heap h, station server)
{
    resolver r = allocate(h, sizeof(struct resolver));
    r->request_map = allocate_table(h, key_from_pointer, compare_pointer);
    r->correlator = 10;
    r->h = h;
    r->server = server;
    r->u = create_udp(init, 
                      ip_wildcard_service,
                      cont(h, dns_input, r));
    return r;
}

