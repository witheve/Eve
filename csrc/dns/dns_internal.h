#if 0
AXFR            252 A request for a transfer of an entire zone
MAILB           253 A request for mailbox-related records (MB, MG or MR)
MAILA           254 A request for mail agent RRs (Obsolete - see MX)
*               255 A request for all records
#endif

#if 0
IN              1 the Internet
CS              2 the CSNET class (Obsolete - used only for examples in
                some obsolete RFCs)
CH              3 the CHAOS class
HS              4 Hesiod [Dyer 87]
#endif

#define OPCODE_STANDARD 0
#define OPCODE_INVERSE 1
#define OPCODE_STATUS 2


static iu8 pop_u8(buffer b)
{
    iu8 n;
    buffer_read(b, &n, bitsizeof(n));
    return(n);
}

static iu16 pop_u16(buffer b)
{
    iu16 n;
    buffer_read(b, &n, bitsizeof(n));
    return(htons(n));
}

static iu32 pop_u32(buffer b)
{
    iu32 n;
    buffer_read(b, &n, bitsizeof(n));
    return(htonl(n));
}

static void push_u16(buffer dest, iu16 source)
{
    iu16 n = htons(source);
    buffer_write(dest, &n, 16);
}

static void push_string(buffer dest, string s)
{
    u8 l = 0;
    value n;
    foreach(n, s) l++;
    buffer_write(dest, &l, 8);
    foreach(n, s) buffer_write(dest, n, 8);
}
