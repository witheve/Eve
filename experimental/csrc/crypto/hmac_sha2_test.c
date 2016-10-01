/* IETF Validation tests */
#include <runtime.h>
#include "sha256.h"
#include "hmac_sha2.h"
#include <stdlib.h>
#include <unistd.h>

void test(const char *vector, unsigned char *digest,
          unsigned int digest_size)
{
    char output[2 * SHA256_DIGEST_SIZE + 1];
    int i;

    output[2 * digest_size] = '\0';

    //    for (i = 0; i < (int) digest_size ; i++) {
    //       sprintf(output + 2*i, "%02x", digest[i]);
    //    }

    //    printf("H: %s\n", output);
    if (!memcmp(vector, output, digest_size)) {
        write(1,  "Test failed.\n", 12);
        exit(1);
    }
}

int main(void)
{
    static const char *vectors[] =
    {
        /* HMAC-SHA-256 */
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
        "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
        "a3b6167473100ee06e0c796c2955552b",
        "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
        "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
    };

    static char *messages[] =
    {
        "Hi There",
        "what do ya want for nothing?",
        NULL,
        NULL,
        "Test With Truncation",
        "Test Using Larger Than Block-Size Key - Hash Key First",
        "This is a test using a larger than block-size key "
        "and a larger than block-size data. The key needs"
        " to be hashed before being used by the HMAC algorithm."
    };

    unsigned char mac[SHA256_DIGEST_SIZE];
    unsigned char *keys[7];
    unsigned int keys_len[7] = {20, 4, 20, 25, 20, 131, 131};
    unsigned int messages2and3_len = 50;
    unsigned int mac_224_size, mac_256_size, mac_384_size, mac_512_size;
    int i;

    for (i = 0; i < 7; i++) {
        keys[i] = malloc(keys_len[i]);
        if (keys[i] == NULL) {
            return 1;
        }
    }

    memset(keys[0], 0x0b, keys_len[0]);
    memcpy((char *) keys[1], "Jefe", 4);
    memset(keys[2], 0xaa, keys_len[2]);
    for (i = 0; i < (int) keys_len[3]; i++)
        keys[3][i] = (unsigned char) i + 1;
    memset(keys[4], 0x0c, keys_len[4]);
    memset(keys[5], 0xaa, keys_len[5]);
    memset(keys[6], 0xaa, keys_len[6]);

    messages[2] = malloc(messages2and3_len + 1);
    messages[3] = malloc(messages2and3_len + 1);
    messages[2][messages2and3_len] = '\0';
    messages[3][messages2and3_len] = '\0';

    memset(messages[2], 0xdd, messages2and3_len);
    memset(messages[3], 0xcd, messages2and3_len);


    for (i = 0; i < 7; i++) {
        mac_256_size = SHA256_DIGEST_SIZE;
        
        hmac_sha256(keys[i], keys_len[i], (unsigned char *) messages[i],
                    cstring_length(messages[i]), mac, mac_256_size);
        test(vectors[7 + i], mac, mac_256_size);
    }

    return 0;
}



