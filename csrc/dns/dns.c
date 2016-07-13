#include <core/core.h>
#include <protocol/ipv4.h>
#include <unix/net.h>
#include <protocol/dns/dns.h>
#include <protocol/dns/dns_internal.h>

#define IN_CLASS 1

typedef struct request {
    int type;
    closure result;
    u16 id;
} *request;
local_type(t_dns_request, sizeof(struct request));

typedef struct resolver {
    buffer_handler write;
    table request_map;
    unsigned int correlator;
    v4service server;
    heap h;
} *resolver;
local_type(t_resolver, sizeof(struct resolver));

static string scan_label(heap h, buffer b)
{
    int len;
    string out = allocate_string(h);
    int count = 0;
    while ((len = pop_u8(b)) > 0) {
        if (len & 0xc0) {
            pop_u8(b);
            return(sstring("[offset]"));
        }
        int i;
        if (count++) push(out, tchar('.'));
        for (i = 0; i<len; i++) 
            push(out, tchar(pop_u8(b)));
    }
    return(out);
}

static boolean scan_rr(heap h, buffer b, request r)
{
    string n = scan_label(init, b);
    iu16 type = pop_u16(b);
    iu16 class = pop_u16(b);
    iu32 ttl = pop_u32(b);

    int rdlen = pop_u16(b)*8;
    buffer rd = allocate_buffer(init, rdlen);
    buffer_read(b, bref(rd, 0), rdlen);
    buffer_produce(rd, rdlen);
    
    // A record and inet class
    if ((type == r->type) && (class == IN_CLASS)) {
        value out = false;
        if (type == DNS_TYPE_A) {
            out = allocate(h, t_v4addr);
            buffer_read(rd, out, 32);
        }
        if (type == DNS_TYPE_PTR) {
            out = scan_label(h, rd);
        }
        apply(r->result, out);
        return(true);
    }
    return(false);
}

static void dns_input(resolver r, buffer input)
{
    u16 id = box_u16(transient, pop_u16(input));
    request x = get(r->request_map, id);
    if (!x) return;

    // serialization
    unset(r->request_map, id);
    iu16 control = pop_u16(input);

    if (control & 0xf) {
        apply(x->result, false);
        return;
    }
    
    int qd = pop_u16(input);
    int an = pop_u16(input);
    int ns = pop_u16(input);
    int ar = pop_u16(input);

    int i;
    for (i = 0; i< qd; i++) {
        scan_label(init, input);
        pop_u16(input);
        pop_u16(input);
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

static void timeout(resolver r, request rq)
{
    if (get(r->request_map, rq->id)) {
        unset(r->request_map, rq->id);
        apply(rq->result, false);
    }
}


static void dns_resolve(resolver r, 
                        int kind,
                        string hostname, 
                        closure complete)
{
    buffer b = allocate_buffer(r->h, 1024);
    u16 id = box_u16(r->h, r->correlator);
    r->correlator = r->correlator + 1;
    request rq = (request)allocate(r->h, t_dns_request);
    rq->result = complete;
    rq->id = id;

    if (kind == DNS_TYPE_MX) rq->type = DNS_TYPE_A;
    if (kind == DNS_TYPE_A) rq->type = DNS_TYPE_A;
    if (kind == DNS_TYPE_PTR) rq->type = DNS_TYPE_PTR;
    
    set(r->request_map, id, rq);

    // we really want to use the binary templates
    push_u16(b, *id);
    int recursive_desired = 1;
    push_u16(b, (recursive_desired<<7) | (OPCODE_STANDARD << 1));
    push_u16(b, 1);
    push_u16(b, 0);
    push_u16(b, 0);
    push_u16(b, 0);

    string i;
    foreach(i, split(transient, hostname, tchar('.')))
        push_string(b, i);

    push_string(b, sstring(""));
    push_u16(b, kind);
    push_u16(b, IN_CLASS);

    apply(r->write, b, r->server);
    register_timer(seconds(transient, 5), closure(r->h, timeout, r, rq));
}

closure allocate_resolver(heap h, v4service server)
{
    resolver r = allocate(h, t_resolver);
    r->request_map = allocate_table(h);
    r->correlator = 10;
    r->h = h;
    r->server = server;
    r->write = create_udp(init, 
                          IP_WILDCARD_SERVICE,
                          closure(h, dns_input, r));
    return(closure(h, dns_resolve, r));
}

