#include <unix_internal.h>
#include <signal.h>
#include <sys/wait.h>
#include <stdio.h>

typedef struct process {
    int pid;
    descriptor in, out, err;
    // xxx - should just use the i/o completion protocol?
    thunk exit;
} *process;

static int cleanup_running=0;
static table pid_table;

/* this is signal context, which is to say we're 
 * not really sure where
 */

// this is just like tcp, fix me
static CONTINUATION_1_2(write_process, process, buffer, thunk);
static void write_process(process fd, buffer b, thunk t)
{
}

static void cleanup()
{
    pid_t p;
    process c;
    int status;

    while (1){
        p = waitpid(-1,&status,WNOHANG);

        if (p <1 ) return;  /* very unfortunate */

        if ((c = table_find(pid_table, (void*)(unsigned long)p))){
            apply(c->exit);
        }   
    }
}

extern void _exit(int);
extern int vfork();

extern void* ignore;

#define cstring_from_string(x)({\
        int f = buffer_length(x);\
        char *r = alloca(f+1);\
        memcpy(r, bref(x, 0), f);\
        r;})
               

buffer_handler allocate_process(heap h, 
                                string name,
                                vector arguments,
                                buffer_handler output,
                                buffer_handler error,
                                thunk exit)
{
    process p = allocate(h, sizeof(struct process));
    descriptor ins[2], outs[2], errs[2];
    pipe(ins);
    pipe(outs);
    pipe(errs);

    p->in = ins[1];
    p->out = outs[0];
    p->err = errs[0];
    p->exit = exit;

    // should be system, but the system call has a funky protocol
    if (!(p->pid = vfork())){

        if ((dup2(ins[0], standardinput) == -1) ||
            (dup2(outs[1], standardoutput) == -1) ||
            (dup2(errs[1], standarderror) == -1)) {
        }

        char **x = allocate(h, vector_length(arguments) * (sizeof(char *) + 1));
        int j = 0;
        vector_foreach(arguments, i) {
            x[j++] = cstring_from_string(i);
        }
                                
        // envp construction
        execve(cstring_from_string(name), x, 0);
        {
            char err[100];
            write(1, err, sprintf(err, "exec error\n"));
        }
        _exit(1);
    }

    table_set(pid_table, (void *)(unsigned long)p->pid, p);

    close(ins[0]);
    close(outs[1]);
    close(errs[1]);

    if (output != ignore)
        register_read_handler(outs[0],
                              cont(h, read_nonblocking_desc, h,
                                      outs[0],
                                      output));

    if (error != ignore)
        register_read_handler(errs[0],
                              cont(h, read_nonblocking_desc, h,
                                      errs[0], 
                                      error));
    return cont(h, write_process, p);
} 

void init_processes()
{
    pid_table = allocate_table(init, key_from_pointer, compare_pointer);
    signal(SIGCHLD, cleanup);
}
