
// the serialization typespace
#define uuid_bits 0x80
#define uuid_mask 0x7f

#define string_bits 0x20
#define string_mask 0x20

#define float_bits 0x13
#define float_mask 0x00


// 1 x x x x x x x uuid
// 0 1 x x x x x x uuid
// 0 0 1 x x x x x string
// 0 0 0 1 0 0 0 0 bigdec
// 0 0 0 1 0 0 0 1 float64
// 0 0 0 1 0 0 1 1 float64
// 0 0 0 0 0 0 0 1 true
// 0 0 0 0 0 0 0 0 false
//["0xxxxxxx"  decode-uuid]
//["111xxxxx"  decode-bigdec]
//["1010xxxx"  decode-vector]
//["1001xxxx"  decode-string]
//["10001010"  decode-five-tuple]
//["10001011"  version1]
//["10001001"  true]
//["10001000"  false]])]

void serialize(buffer dest, value v)
{
}
