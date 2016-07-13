#define DNS_PORT 53

#define DNS_TYPE_A               1 // a host address
#define DNS_TYPE_NS              2 // an authoritative name server
#define DNS_TYPE_MD              3 // a mail destination (Obsolete - use MX)
#define DNS_TYPE_MF              4 // a mail forwarder (Obsolete - use MX)
#define DNS_TYPE_CNAME           5 // the canonical name for an alias
#define DNS_TYPE_SOA             6 // marks the start of a zone of authority
#define DNS_TYPE_MB              7 // a mailbox domain name (EXPERIMENTAL)
#define DNS_TYPE_MG              8 // a mail group member (EXPERIMENTAL)
#define DNS_TYPE_MR              9 // a mail rename domain name (EXPERIMENTAL)
#define DNS_TYPE_NULL            10 // a null RR (EXPERIMENTAL)
#define DNS_TYPE_WKS             11 // a well known service description
#define DNS_TYPE_PTR             12 // a domain name pointer
#define DNS_TYPE_HINFO           13 // host information
#define DNS_TYPE_MINFO           14 // mailbox or mail list information
#define DNS_TYPE_MX              15 // mail exchange
#define DNS_TYPE_TXT             16 // text strings
#define DNS_TYPE_AAAA            28 // v6 addresses


static inline void inverse_resolve(closure(r, buffer), station a, closure name_handler)
{
    unsigned char *b = (void *)a;
    string x = aprintf(transient, "%d.%d.%d.%d.in-addr.arpa",
                       b[3], b[2], b[1], b[0]);
    apply(r, DNS_TYPE_PTR, x, name_handler);
}

