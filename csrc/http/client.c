#include <core/core.h>
#include <unix/unix.h>
#include <http/http.h>


typedef struct client {
    heap h;
    vector queued;
} *client;


static CONTINUATION_1_2(client_input, client, buffer, thunk)
     static void client_input(client c, buffer b, thunk t)
{
    apply(t);
}


// also query...concurrency/pipelining?
void http_request(table headers, string uri, buffer body, buffer_handler respose)
{
    
}


static CONTINUATION_1_0(connected, client)
static void connected(client c)
{
    
}

client open_http_client(heap h, station s, table headers, buffer body, buffer_handler respose)
{

    client c = allocate(h, sizeof(struct client));
    tcp_create_client (h, s,
                       cont(h, client_input, c),
                       cont(h, connected));
}

