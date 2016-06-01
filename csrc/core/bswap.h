
// assuming little
#define htons(_x) (((_x>>8) & 0xff) | ((_x<<8) & 0xff00))
#define htonl(_x) ((((_x)>>24) & 0xffL) | (((_x)>>8) & 0xff00L) | \
                  (((_x)<<8) & 0xff0000L) | (((_x)<<24) & 0xff000000L))
#define htonll(_x) ((((iu64)htonl(_x)) << 32) | (htonl(_x) >> 32))
