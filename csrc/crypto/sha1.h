
#define SHA1_DIGEST_SIZE 20


typedef struct {
    iu32 state[5];
    iu32 count[2];
    iu8 buf[64];
} SHA1_CTX;

void SHA1_Transform(iu32 state[5], iu8 buffer[64]);


