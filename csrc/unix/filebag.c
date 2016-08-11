#include <runtime.h>
#include <dirent.h>

static table file_attributes = 0;

typedef struct filebag {
    table idmap;
} *filebag;

// emacs, cmon man 
//#ifndef MAXNAMLEN
//#define MAXNAMLEN NAME_MAX
/#endif


void filebag_scan(filebag f, int sig, listener out, value e, value a, value v)
{
    if (sig & 0x04) {
        if (sig & 0x02) {
            estring p = table_find(f->idmap, e);
            char *name = alloca(p->length + MAXNAMELEN);
            memcpy(name, p->body, p->length);
            if (a == sym(children)) {
                name[p->length] = 0;
                DIR *x = opendir(name);
                struct dirent *f;
                
                while((f = readdir(x))) {
                    int namelen = MAXNAMELEN - (sizeof(struct dirent) - f->d_reclen);
                    child = generate_uuid();
                    memcpy(name + p->length, f->d_name, namelen);
                    table_set(f->idmap, child, intern_string(name ,p->length + namelen));
                    edb_insert(b, f, sym(children), child);
                }
            }
        }
    }
    // silently drop all inquries about free entities...we can filter on attribute, but value..man..
}

void filebag_insert(filebag f, value e, value a, value v, multiplicity m, uuid bku)
{
}

// should return an abstract bag
void filebag_init()
{
    if (!file_attributes) {
        file_attributes = create_value_table(init);
        table_set(file_attributes, sym(length), (void *)1);
        table_set(file_attributes, sym(owner), (void *)1);
    }
    
}
