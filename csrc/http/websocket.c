#include <runtime.h>
#include <unix/unix.h>
#include <http/http.h>
#include <bswap.h>

extern thunk ignore;

typedef struct websocket {
    heap h;
    heap buffer_heap;
    buffer reassembly;
    buffer_handler client;
    buffer_handler write;
} *websocket;


// implement close
void websocket_send(websocket w, int opcode, buffer b, thunk t)
{
    int length = buffer_length(b);
    buffer out = allocate_buffer(w->h, 10);
    buffer_write_byte(out, opcode | 0x80);
    if (length > 65536) {
        buffer_write_byte(out, 127);
        buffer_write_be64(out, length);
    } else {
        if (length > 125) {
            buffer_write_byte(out, 126);
            buffer_write_be16(out, length);
        } else {
            buffer_write_byte(out, length);
        }
    }
    apply(w->write, out, ignore); // reclaim
    apply(w->write, b, t);
}


CONTINUATION_1_2(websocket_output_frame, websocket, buffer, thunk);
void websocket_output_frame(websocket w, buffer b, thunk t)
{
    websocket_send(w, 1, b, t);
}

extern void handle_json_query(heap h, buffer b, buffer_handler output);

static CONTINUATION_1_2(websocket_input_frame, websocket, buffer, thunk);
static void websocket_input_frame(websocket w, buffer b, thunk t)
{
    int offset = 2;
    
    if (!b) {
        apply(w->client, 0, ignore);
        return;
    }

    // there is a better approach here, chained buffers, or at least assuming it will fit
    buffer_append(w->reassembly, bref(b, 0), buffer_length(b));
    int rlen = buffer_length(w->reassembly);
    if (rlen < offset) return;

    iu64 length = *(u8)bref(w->reassembly, 1) & 0x7f;

    if (length == 126) {
        if (rlen < 4) return;
        length = htons(*(u16)bref(w->reassembly, 2));
        offset += 2;
    } else {
        if (length == 127) {
            // ok, we are throwing away the top byte, who the hell thought
            // that 1TB wasn't enough per object
            if (rlen< 10) return;
            length = htonll(*(u64)bref(w->reassembly, 2));
            offset += 8;
        }
    }
    

    iu32 mask = 0;
    // which should always be the case for client streams
    if (*(u8)bref(w->reassembly, 1) & 0x80) {
        mask = *(u32)bref(b, offset);
        offset += 4;
    }

    if ((rlen - offset) >= length) {
        if (mask) {
            for (int i=0;i<((length +3)/4); i++) {
                // xxx - fallin off the end 
                *(u32)bref(w->reassembly, offset + i * 4) ^= mask;
            }
        }
        // xxx - only deliver this message
        // compress reassembly buffer

        w->reassembly->start += offset;
        handle_json_query(w->h, w->reassembly, cont(w->h, websocket_output_frame, w));
        //        apply(w->client, w->reassembly, ignore);
        // compress
        w->reassembly->start += length;
    }
    apply(t);
}

void websocket_connect(int status, thunk send)
{
    buffer b = allocate_buffer(init, 20);
    buffer_append(b, "\"hello!\"", 8);
    apply(send, b, ignore);
}

void sha1(buffer d, buffer s);
// xxx - fix wiring

buffer_handler websocket_send_upgrade(heap h,
                                      thunk connect,
                                      string key,
                                      buffer_handler write)
{
    websocket w = allocate(h, sizeof(struct websocket));

    // fix
    w->reassembly = allocate_buffer(h, 1000);
    w->write = write;
    w->h = h;

    string_concat(key, sstring("258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
    buffer sh = allocate_buffer(h, 20);
    sha1(sh, key);
    string r = base64_encode(h, sh);
    buffer b = allocate_buffer(h, 200);

    outline(b, "HTTP/1.1 101 Switching Protocols");
    outline(b, "Upgrade: websocket");
    outline(b, "Connection: Upgrade");
    outline(b, "Sec-WebSocket-Accept: %b", r);
    outline(b, "");
    prf("websocket accept: %b\n", b);

    apply(write, b, ignore);
    apply(connect, 0, cont(h, websocket_output_frame,w));
    websocket_connect(0, cont(h, websocket_output_frame,w));
    return(cont(h, websocket_input_frame, w));
}

