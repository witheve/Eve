
struct buffer {
    bytes start;
    bytes end;
    bytes length;
    heap h;
    void *contents;
};


#define alloca_wrap_buffer(__b, __l) ({           \
  buffer b = alloca(sizeof(struct buffer));   \
  b->contents = __b;\
  b->end = b->length = __l;\
  b->start  =0 ;\
  b->h = 0;\
  b;\
  })

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
    // xxx - pad to pagesize
    if (b->length < (b->end + len)) {
        int oldlen = b->length;
        b->length = 2*((b->end-b->start)+len);
        void *new =  allocate(b->h, b->length);
        memcpy(new, b->contents + b->start, (b->end-b->start));
        deallocate(b->h, b->contents, oldlen);
        b->end = b->end - b->start;
        b->start = 0;
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

#define WRITE_BE(bits)\
   static inline void buffer_write_be##bits(buffer b, u64 x)   \
  {                                                            \
      u64 k = x;                                               \
      int len = bits>>3;                                       \
      buffer_extend(b, len);                                   \
      u8 *n = bref(b, b->end);                                 \
      for (int i = len-1; i >= 0; i--) {                       \
          n[i] = k & 0xff;                                     \
          k >>= 8;                                             \
      }                                                        \
      b->end += len;                                           \
  }

#define READ_BE(bits)                                            \
    static inline u64 buffer_read_be##bits(buffer b)             \
    {                                                            \
        u64 k = 0;                                               \
        int len = bits>>3;                                       \
        u8 *n = bref(b, 0);                                      \
        for (int i = 0; i < len; i++) {                          \
            k = (k << 8) | (*n++);                               \
        }                                                        \
        b->start +=len;                                          \
        return(k);                                               \
    }

WRITE_BE(64)
WRITE_BE(32)
WRITE_BE(16)
READ_BE(64)
READ_BE(32)
READ_BE(16)

static inline u64 buffer_read_byte(buffer b)
{
    u64 r = *(u8 *)bref(b, 0);
    b->start += 1;
    return(r);
}

static inline void buffer_write_byte(buffer b, u8 x)
{
    buffer_extend(b, 1);                                  
    *(u8 *)bref(b, buffer_length(b)) = x;
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

static inline void buffer_clear(buffer b)
{
    b->start = b->end = 0;
}

void print_hex_buffer(buffer s, buffer b);

void print_byte(buffer b, u8 f);

static inline void deallocate_buffer(buffer b)
{
    heap h = b->h;
    deallocate(h, b->contents, b->length);
    deallocate(h, b, sizeof(struct buffer));
}

