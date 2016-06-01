
typedef struct buffer {
    bytes start;
    bytes end;
    bytes length;
    heap h;
    void *contents;
} *buffer;


static inline buffer wrap_buffer(heap h,
                                 void *body,
                                 bytes length)
{
    buffer new = allocate(h, sizeof(struct buffer));
    new->contents = body;
    new->start = 0;
    new->end = length;
    new->length = length;
    return(new);
}

buffer allocate_buffer(heap h, bytes length);


static inline void *bref(buffer b, bytes offset)
{
    // alignment?
    return((void *)b->contents + (b->start + offset));
}

static inline void buffer_extend(buffer b, bytes len)
{
    if (b->length < (b->end + len)) {
        b->length = 2*((b->end-b->start)+len);
        void *new =  allocate(b->h, b->length);
        b->end = b->end - b->start;
        b->start = 0;
        memcpy(new, bref(b, 0), (b->end-b->start));
        b->contents = new;
    }
}

static inline bytes buffer_length(buffer b)
{
    return(b->end - b->start);
} 


buffer buffer_concat(heap, buffer, buffer);

static inline void buffer_consume(buffer b, bytes s)
{
    b->start += s; 
}

static inline void buffer_produce(buffer b, bytes s)
{
    b->end += s; 
}

void buffer_extend(buffer b, bytes len);

void buffer_copy(buffer dest, bytes doff,
                 buffer source, bytes soff,
                 bytes length);

void buffer_write(buffer b, void *source, bytes length);
boolean buffer_read(buffer b, void *dest, bytes length);

void buffer_append(buffer b,
                   void *body,
                   bytes length);

void buffer_prepend(buffer b,
                      void *body,
                      bytes length);

void buffer_read_field(buffer b,
                       bytes offset, 
                       void *dest,
                       bytes length);

#define WRITE_BE(bytes)\
  static inline void buffer_write_be##bytes(buffer b, iu64 x)\
  {                                                            \
      iu64 k = x;                                              \
      buffer_extend(b, bytes);                                  \
      iu8 *n = bref(b, b->end);                                \
      for (int i = (bytes)-1; i >= 0; i--) {                  \
          n[i] = k & 0xff;                                     \
          k >>= 8;                                             \
      }                                                        \
      b->end += bytes;                                          \
  }

#define READ_BE(bytes)                                   \
    static inline iu64 buffer_read_be##bytes(buffer b)        \
    {                                                           \
        iu64 k = 0;                                          \
        iu8 *n = bref(b, b->start);                             \
        for (int i = 0; i < (bytes); i++) {                    \
            k = (k << 8) | (*n++);                              \
        }                                                       \
        b->start += bytes;                                       \
        return(k);                                              \
    }

WRITE_BE(64)
WRITE_BE(32)
WRITE_BE(16)
READ_BE(64)
READ_BE(32)
READ_BE(16)

static inline iu64 buffer_read_byte(buffer b)
{
    iu64 r = *(u8)bref(b, 0);
    b->start += 1;
    return(r);
}

static inline void buffer_write_byte(buffer b, iu8 x)
{
    buffer_extend(b, 1);                                  
    *(u8)bref(b, buffer_length(b)) = x;
    b->end += 1;
}

static inline buffer sub_buffer(heap h, 
                                buffer b,
                                bytes start,
                                bytes length)
{
    // copy?
    return(wrap_buffer(h, b->contents+(b->start+start), length));
}
