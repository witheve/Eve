#include <runtime.h>
#include <unix.h>
#include <http/http.h>


typedef struct client {
    heap h;
    vector queued;
} *client;


static CONTINUATION_1_4(response_body, client, bag, uuid, buffer, register_read);
static void response_body(client c, bag b, uuid n, buffer in, register_read r)
{
    apply(r, response_header_parser(c->h, cont(c->h, response_body, c)));
}


void http_request(table headers, string uri, buffer body, buffer_handler respose)
{
    
}


static CONTINUATION_1_2(client_connected, client, buffer_handler, register_read);
static void client_connected(client c, buffer_handler h, register_read r)
{
    apply(r, response_header_parser(c->h, cont(c->h, response_body, c)));
}

client open_http_client(heap h, bag s, uuid request, http_handler response)
{
    station a;
    client c = allocate(h, sizeof(struct client));
    tcp_create_client (h, a, cont(h, client_connected, c));
}

