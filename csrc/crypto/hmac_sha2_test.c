/* IETF Validation tests */

#include <stdio.h>
#include <stdlib.h>

void test(const char *vector, unsigned char *digest,
          unsigned int digest_size)
{
    char output[2 * SHA512_DIGEST_SIZE + 1];
    int i;

    output[2 * digest_size] = '\0';

    for (i = 0; i < (int) digest_size ; i++) {
       sprintf(output + 2*i, "%02x", digest[i]);
    }

    printf("H: %s\n", output);
    if (strcmp(vector, output)) {
        fprintf(stderr, "Test failed.\n");
        exit(1);
    }
}

int main(void)
{
    static const char *vectors[] =
    {
        /* HMAC-SHA-224 */
        "896fb1128abbdf196832107cd49df33f47b4b1169912ba4f53684b22",
        "a30e01098bc6dbbf45690f3a7e9e6d0f8bbea2a39e6148008fd05e44",
        "7fb3cb3588c6c1f6ffa9694d7d6ad2649365b0c1f65d69d1ec8333ea",
        "6c11506874013cac6a2abc1bb382627cec6a90d86efc012de7afec5a",
        "0e2aea68a90c8d37c988bcdb9fca6fa8",
        "95e9a0db962095adaebe9b2d6f0dbce2d499f112f2d2b7273fa6870e",
        "3a854166ac5d9f023f54d517d0b39dbd946770db9c2b95c9f6f565d1",
        /* HMAC-SHA-256 */
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
        "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
        "a3b6167473100ee06e0c796c2955552b",
        "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
        "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
        /* HMAC-SHA-384 */
        "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59c"
        "faea9ea9076ede7f4af152e8b2fa9cb6",
        "af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e"
        "8e2240ca5e69e2c78b3239ecfab21649",
        "88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b"
        "2a5ab39dc13814b94e3ab6e101a34f27",
        "3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e"
        "6801dd23c4a7d679ccf8a386c674cffb",
        "3abf34c3503b2a23a46efc619baef897",
        "4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c6"
        "0c2ef6ab4030fe8296248df163f44952",
        "6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5"
        "a678cc31e799176d3860e6110c46523e",
        /* HMAC-SHA-512 */
        "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde"
        "daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
        "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554"
        "9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
        "fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39"
        "bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb",
        "b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3db"
        "a91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd",
        "415fad6271580a531d4179bc891d87a6",
        "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f352"
        "6b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598",
        "e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944"
        "b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58"
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

    unsigned char mac[SHA512_DIGEST_SIZE];
    unsigned char *keys[7];
    unsigned int keys_len[7] = {20, 4, 20, 25, 20, 131, 131};
    unsigned int messages2and3_len = 50;
    unsigned int mac_224_size, mac_256_size, mac_384_size, mac_512_size;
    int i;

    for (i = 0; i < 7; i++) {
        keys[i] = malloc(keys_len[i]);
        if (keys[i] == NULL) {
            fprintf(stderr, "Can't allocate memory\n");
            return 1;
        }
    }

    memset(keys[0], 0x0b, keys_len[0]);
    strcpy((char *) keys[1], "Jefe");
    memset(keys[2], 0xaa, keys_len[2]);
    for (i = 0; i < (int) keys_len[3]; i++)
        keys[3][i] = (unsigned char) i + 1;
    memset(keys[4], 0x0c, keys_len[4]);
    memset(keys[5], 0xaa, keys_len[5]);
    memset(keys[6], 0xaa, keys_len[6]);

    messages[2] = malloc(messages2and3_len + 1);
    messages[3] = malloc(messages2and3_len + 1);

    if (messages[2] == NULL || messages[3] == NULL) {
        fprintf(stderr, "Can't allocate memory\n");
        return 1;
    }

    messages[2][messages2and3_len] = '\0';
    messages[3][messages2and3_len] = '\0';

    memset(messages[2], 0xdd, messages2and3_len);
    memset(messages[3], 0xcd, messages2and3_len);

    printf("HMAC-SHA-2 IETF Validation tests\n\n");

    for (i = 0; i < 7; i++) {
        if (i != 4) {
            mac_224_size = SHA224_DIGEST_SIZE;
            mac_256_size = SHA256_DIGEST_SIZE;
            mac_384_size = SHA384_DIGEST_SIZE;
            mac_512_size = SHA512_DIGEST_SIZE;
        } else {
            mac_224_size = 128 / 8; mac_256_size = 128 / 8;
            mac_384_size = 128 / 8; mac_512_size = 128 / 8;
        }

        printf("Test %d:\n", i + 1);

        hmac_sha224(keys[i], keys_len[i], (unsigned char *) messages[i],
                    strlen(messages[i]), mac, mac_224_size);
        test(vectors[i], mac, mac_224_size);
        hmac_sha256(keys[i], keys_len[i], (unsigned char *) messages[i],
                    strlen(messages[i]), mac, mac_256_size);
        test(vectors[7 + i], mac, mac_256_size);
        hmac_sha384(keys[i], keys_len[i], (unsigned char *) messages[i],
                    strlen(messages[i]), mac, mac_384_size);
        test(vectors[14 + i], mac, mac_384_size);
        hmac_sha512(keys[i], keys_len[i], (unsigned char *) messages[i],
                    strlen(messages[i]), mac, mac_512_size);
        test(vectors[21 + i], mac, mac_512_size);
    }

    printf("All tests passed.\n");

    return 0;
}



