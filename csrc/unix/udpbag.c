#include <unix_internal.h>

typedef struct udp_bag {
    struct bag b;
    heap h;
    udp u;
} *udp_bag;


static void udp_scan(udp_bag u, int sig, listener out, value e, value a, value v)
{
}

static CONTINUATION_1_1(udp_commit, udp_bag, edb);
// oh the shame
static void udp_commit(udp_bag u, edb s)
{
    station d;
    edb_foreach_e(s, e, sym(tag), sym(packet), c) {
        edb_foreach_v(s, e, sym(destination), v, c) 
            d = v;
    }
}

static CONTINUATION_1_2(udp_reception, udp_bag, station, buffer);
static void udp_reception(udp_bag u, station s, buffer b)
{
    prf("input - maka bag\n");
    uuid p = generate_uuid();
    bag in = (bag)create_edb(u->h, 0);
    apply(deserialize_into_bag(u->h, in), b, ignore);
    table_foreach(((bag)u)->listeners, t, _) 
        apply((bag_handler)t, in);
}

bag udp_bag_init()
{
    // this should be some kind of parameterized listener.
    // we can do the same trick that we tried to do
    // with time, by creating an open read, but it
    // has strange consequences. sidestep by just
    // having an 'eve port'
    heap h = allocate_rolling(pages, sstring("udp bag"));
    udp_bag ub = allocate(h, sizeof(struct udp_bag));
    ub->h = h;
    ub->u = create_udp(h, ip_wildcard_service, cont(h, udp_reception, ub));
    ub->b.commit = cont(h, udp_commit, ub);
    ub->b.listeners = allocate_table(h, key_from_pointer, compare_pointer);
    ub->b.blocks = allocate_vector(h, 0);
    ub->b.block_listeners = allocate_table(h, key_from_pointer, compare_pointer);
    return (bag)ub;
}
