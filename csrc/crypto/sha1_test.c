
static char *test_data[] = {
    "abc",
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "A million repetitions of 'a'"
};
static char *test_results[] = {
    "A9993E36 4706816A BA3E2571 7850C26C 9CD0D89D",
    "84983E44 1C3BD26E BAAE4AA1 F95129E5 E54670F1",
    "34AA973C D4C4DAA4 F61EEB2B DBAD2731 6534016F"
};

void
digest_to_hex(const uint8_t digest[SHA1_DIGEST_SIZE], char *output)
{
    int i, j;
    char *c = output;

    for (i = 0; i < SHA1_DIGEST_SIZE / 4; i++) {
        for (j = 0; j < 4; j++) {
            sprintf(c, "%02X", digest[i * 4 + j]);
            c += 2;
        }
        sprintf(c, " ");
        c += 1;
    }
    *(c - 1) = '\0';
}

int
main(int argc, char **argv)
{
    int k;
    SHA1_CTX context;
    uint8_t digest[20];
    char output[80];

    fprintf(stdout, "verifying SHA-1 implementation... ");

    for (k = 0; k < 2; k++) {
        SHA1_Init(&amp;context);
        SHA1_Update(&amp;context, (uint8_t *) test_data[k], strlen(test_data[k]));
        SHA1_Final(&amp;context, digest);
        digest_to_hex(digest, output);

        if (strcmp(output, test_results[k])) {
            fprintf(stdout, "FAIL\n");
            fprintf(stderr, "* hash of \"%s\" incorrect:\n", test_data[k]);
            fprintf(stderr, "\t%s returned\n", output);
            fprintf(stderr, "\t%s is correct\n", test_results[k]);
            return (1);
        }
    }
    /* million 'a' vector we feed separately */
    SHA1_Init(&amp;context);
    for (k = 0; k < 1000000; k++)
        SHA1_Update(&amp;context, (uint8_t *) "a", 1);
    SHA1_Final(&amp;context, digest);
    digest_to_hex(digest, output);
    if (strcmp(output, test_results[2])) {
        fprintf(stdout, "FAIL\n");
        fprintf(stderr, "* hash of \"%s\" incorrect:\n", test_data[2]);
        fprintf(stderr, "\t%s returned\n", output);
        fprintf(stderr, "\t%s is correct\n", test_results[2]);
        return (1);
    }

    /* success */
    fprintf(stdout, "ok\n");
    return (0);
}
