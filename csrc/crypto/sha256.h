/*********************************************************************
* Filename:   sha256.h
* Author:     Brad Conte (brad AT bradconte.com)
* Copyright:
* Disclaimer: This code is presented "as is" without any guarantees.
* Details:    Defines the API for the corresponding SHA1 implementation.
*********************************************************************/

#ifndef SHA256_H
#define SHA256_H

/****************************** MACROS ******************************/
#define SHA256_DIGEST_SIZE 32            // SHA256 outputs a 32 byte digest
#define SHA256_BLOCK_SIZE 32            // SHA256 outputs a 32 byte digest


typedef struct {
	byte data[64];
	u32 datalen;
	unsigned long long bitlen;
	u32 state[8];
} sha256_ctx;

/*********************** FUNCTION DECLARATIONS **********************/
void sha256_init(sha256_ctx *ctx);
void sha256_update(sha256_ctx *ctx, const byte data[], bytes len);
void sha256_final(sha256_ctx *ctx, byte hash[]);

#endif   // SHA256_H
