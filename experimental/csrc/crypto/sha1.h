
#define SHA1_DIGEST_SIZE 20


typedef struct {
    u32 state[5];
    u32 count[2];
    u8 buf[64];
} SHA1_CTX;

void SHA1_Transform(u32 state[5], u8 buffer[64]);


