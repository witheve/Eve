static inline int fetch_and_add(u64 * variable, u64 value) {
    asm volatile("lock; xaddl %%eax, %2;"
                 :"=a" (value)                  //Output
                 :"a" (value), "m" (*variable)  //Input
                 :"memory");
    return value;
}
