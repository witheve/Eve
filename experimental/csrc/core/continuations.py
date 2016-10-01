#!/usr/bin/python
import sys

def generate_cont(left, right, variant):
    state = 'struct _continuation_##_name'
    apply = '_apply_##_name'
    fill =  '_fill_##_name'
    
    def list(args):          return '(' + ", ".join(args) + ')'
    def body(head, x, t):    return [head + '{'] + ["   %s;" % i for i in x] + ['}' + t]
    def set(prefix, count):  return ['%s%d' % (prefix, i) for i in range(count)]
    def dset(p1, p2, count): return ['%s%d %s%d' % (p1, i, p2, i) for i in range(count)]
    
    if (variant == 'free'): return_type = 'boolean'
    else: return_type = 'void'

    rights = set('_r', right)
    lefts = set('_l', left)

    # ok I fixed the macros in continaution.h so we can use those
    # instead of encoding the types here
    def ctype(x): return 'void (**' + x + ')' + list(['void *'] + rights)
    otype = 'void (**)' + list(['void *'] + rights)
    
    if (variant == 'free'): wrapname = 'FCONTINUATION'
    else:  wrapname = 'CONTINUATION'
    res = ["#define " + wrapname + "_" + str(left) + "_" + str(right) +\
               list(['_name'] + lefts + rights)]

    # the forward declaration of the external body function
    res += [return_type + ' _name'  + list(lefts + rights) + ';']

    elements =   ['void (*_apply)' + list(['void *'] + set ('_r', right))] +\
                 ['char *name']+\
                 dset('_l', 'l', left)

    if (variant == 'free'): elements += ['heap h']

    # the structure
    res +=  body(state, elements, ';')
   
    apply_body = [state + ' *n = z']
    call = '_name' + list(set('n->l', left) + set('r', right))

    if (variant == 'free'):
        apply_body +=  ['if (' + call + ') deallocate(n->h, n, sizeof(struct _continuation_##_name))']
    else:
        apply_body += [call]

    # the apply wrapper
    res += body('static void ' + apply + list(['void *z'] + dset('_r', 'r', right)),
                apply_body, '')
    
    
    # the closure generator
    fill_body = ['n->_apply = ' + apply] +\
                ['n->name = #_name'] +\
                dset('n->l', '= l', left)
    if (variant == 'free'):
        fill_body += ['n->h = h']  
    fill_body += ['return ('+ otype + ')n'] 
    res += body('static ' + ctype (fill + list([state + '* n'] + ['heap h'] + dset('_l', 'l', left))), fill_body, '')
  
    return '\\\n'.join(res) + '\n\n'

def file_dump(name, contents):
    f = open(name, 'w')
    f.write(contents)
    f.close()


out = ""

for i in range(int(sys.argv[1]) + 1):
    for j in range(int(sys.argv[2]) + 1):
        out += generate_cont(i, j, 'generic')
        out += generate_cont(i, j, 'free')

file_dump(sys.argv[3], out)
        
        
