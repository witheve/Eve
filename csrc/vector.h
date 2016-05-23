
typedef buffer vector;

vector allocate_vector(heap);
typedef vector fifo;
fifo allocate_fifo(heap);

vector build_vector_internal(heap, ...);

#define build_vector(_h, ...)\
    build_vector_internal(_h, ##__VA_ARGS__, END_OF_ARGUMENTS)

#define build_fifo(_h, ...)\
    set_type(build_vector_internal(_h, ##__VA_ARGS__, END_OF_ARGUMENTS),\
             t_fifo)


//bootstrap
void vector_insert(vector, value);
iu32 vector_length(vector);
// why isn't this vector_get?
value vector_ref(vector v, int element);
void vector_set(vector v, int element, value x);
#define vector_foreach(__i, __s)\
    for (value __i, __j = (void *)0; __i = vector_ref(__s, (unsigned long)__j), (unsigned long)__j < vector_length(__s); __j = (value)((unsigned long)__j + \
                                                                                                                                       1))

