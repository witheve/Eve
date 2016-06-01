#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>
#include <bswap.h>

extern thunk ignore;

  /*
    bit fin         0
    bit rsv[3]
    bit opcode[4]   4
    bit mask        5
    bit payload_len[7]
    bit length_extension1[16]
    bit length_extension2[48]
    bit masking_key[32]
    ....data...
  */


typedef struct websocket {
    heap h;
    heap buffer_heap;
    buffer reassembly;
    buffer_handler client;
    buffer_handler write;
    iu32 mask;
} *websocket;

CONTINUATION_2_2(websocket_output_frame, websocket, synchronous_buffer, buffer, thunk);
void websocket_output_frame(websocket w, synchronous_buffer write, buffer b, thunk t)
{
    int length = buffer_length(b);
    // force a resize if length is extended
    buffer out = allocate_buffer(w->h, length + 6);
    // just the short case
    unsigned char control = 0x81;
    buffer_append(out, &control, 8);
    unsigned char plen = length;
    buffer_append(out, &plen, 1);

    apply(write, out, ignore); // reclaim
    apply(write, b, t);
}

static CONTINUATION_1_2(websocket_input_frame, websocket, buffer, thunk);
static void websocket_input_frame(websocket w, buffer b, thunk t)
{
    int offset;
    
    if (!b) {
        apply(w->client, 0);
        return;
    }

    iu32 mask;
    // there is a better approach here
    buffer_append(w->reassembly, bref(b, 0), buffer_length(b));
    int rlen = buffer_length(w->reassembly);
    if (rlen < 2) return;

    iu64 length = *(u8)bref(w->reassembly, 1) & 0x7f;
    int olen = length;

    if (length > 126) {
        if (rlen < 4) return;
        length = (length << 16) + htons(*(u16)bref(b, 2));
        offset = 2;
    }
    
    if (olen == 127) {
        // ok, we are throwing away the top byte, who the hell thought
        // that 1TB wasn't enough per object
        if (rlen< 10) return;
        length = htonll(*(u32)bref(b, 2));
        offset = 4;
    }
    
    if (rlen < length) {
        buffer out = allocate_buffer(w->h, length);

        if (length > 126) w->reassembly->start += 2;
        if (length == 127) w->reassembly->start += 4;
        // which should always be the case for client streams
        if (*(u8)bref(w->reassembly, 1) & 0x80) {
            if (rlen < offset + 4) return;
            w->mask = *(unsigned int *)bref(b, offset);
            offset +=4;
        }

        w->reassembly->start += offset;
        apply(w->client, w->reassembly);
        w->reassembly = allocate_buffer(w->h, 128);
    }
}

buffer sha1(heap h, buffer b);

synchronous_buffer websocket_send_upgrade(heap h, 
                                          thunk connect,
                                          table props,
                                          synchronous_buffer write)
{
    websocket w = allocate(h, sizeof(struct websocket));

    string f = table_find(props, "Sec-WebSocket-Key");
    string_concat(f, sstring("258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
    string r = base64_encode(h, sha1(h, f));

    outline(write, sstring("HTTP/1.1 101 Switching Protocols"));
    outline(write, sstring("Upgrade: websocket"));
    outline(write, sstring("Connection: Upgrade"));
    outline(write, aprintf(h, "Sec-WebSocket-Accept: %b", r));
    outline(write, sstring(""));

    apply(connect, props, cont(h, websocket_output_frame,w, write));
    return(cont(h, websocket_input_frame, w));
}

/*
void register_websocket_service(heap h,
                                http_server s, 
                                string url,
                                thunk connect)
{
    register_http_service(s, url,
                          cont(h, websocket_send_upgrade,
                                  h, connect));
}

*/
