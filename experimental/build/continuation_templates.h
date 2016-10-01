#define CONTINUATION_0_0(_name)\
void _name();\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name();\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_0_0(_name)\
boolean _name();\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name()) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_0_1(_name, _r0)\
void _name(_r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_0_1(_name, _r0)\
boolean _name(_r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_0_2(_name, _r0, _r1)\
void _name(_r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_0_2(_name, _r0, _r1)\
boolean _name(_r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_0_3(_name, _r0, _r1, _r2)\
void _name(_r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_0_3(_name, _r0, _r1, _r2)\
boolean _name(_r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_0_4(_name, _r0, _r1, _r2, _r3)\
void _name(_r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_0_4(_name, _r0, _r1, _r2, _r3)\
boolean _name(_r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_0_5(_name, _r0, _r1, _r2, _r3, _r4)\
void _name(_r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_0_5(_name, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_0_6(_name, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_0_6(_name, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_0_7(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_0_7(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_0_8(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_0_8(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_0_9(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_0_9(_name, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_1_0(_name, _l0)\
void _name(_l0);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_1_0(_name, _l0)\
boolean _name(_l0);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_1_1(_name, _l0, _r0)\
void _name(_l0, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_1_1(_name, _l0, _r0)\
boolean _name(_l0, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_1_2(_name, _l0, _r0, _r1)\
void _name(_l0, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_1_2(_name, _l0, _r0, _r1)\
boolean _name(_l0, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_1_3(_name, _l0, _r0, _r1, _r2)\
void _name(_l0, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_1_3(_name, _l0, _r0, _r1, _r2)\
boolean _name(_l0, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_1_4(_name, _l0, _r0, _r1, _r2, _r3)\
void _name(_l0, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_1_4(_name, _l0, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_1_5(_name, _l0, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_1_5(_name, _l0, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_1_6(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_1_6(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_1_7(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_1_7(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_1_8(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_1_8(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_1_9(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_1_9(_name, _l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_2_0(_name, _l0, _l1)\
void _name(_l0, _l1);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_2_0(_name, _l0, _l1)\
boolean _name(_l0, _l1);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_2_1(_name, _l0, _l1, _r0)\
void _name(_l0, _l1, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_2_1(_name, _l0, _l1, _r0)\
boolean _name(_l0, _l1, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_2_2(_name, _l0, _l1, _r0, _r1)\
void _name(_l0, _l1, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_2_2(_name, _l0, _l1, _r0, _r1)\
boolean _name(_l0, _l1, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_2_3(_name, _l0, _l1, _r0, _r1, _r2)\
void _name(_l0, _l1, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_2_3(_name, _l0, _l1, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_2_4(_name, _l0, _l1, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_2_4(_name, _l0, _l1, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_2_5(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_2_5(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_2_6(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_2_6(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_2_7(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_2_7(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_2_8(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_2_8(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_2_9(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_2_9(_name, _l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_3_0(_name, _l0, _l1, _l2)\
void _name(_l0, _l1, _l2);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_3_0(_name, _l0, _l1, _l2)\
boolean _name(_l0, _l1, _l2);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_3_1(_name, _l0, _l1, _l2, _r0)\
void _name(_l0, _l1, _l2, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_3_1(_name, _l0, _l1, _l2, _r0)\
boolean _name(_l0, _l1, _l2, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_3_2(_name, _l0, _l1, _l2, _r0, _r1)\
void _name(_l0, _l1, _l2, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_3_2(_name, _l0, _l1, _l2, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_3_3(_name, _l0, _l1, _l2, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_3_3(_name, _l0, _l1, _l2, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_3_4(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_3_4(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_3_5(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_3_5(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_3_6(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_3_6(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_3_7(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_3_7(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_3_8(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_3_8(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_3_9(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_3_9(_name, _l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_4_0(_name, _l0, _l1, _l2, _l3)\
void _name(_l0, _l1, _l2, _l3);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_4_0(_name, _l0, _l1, _l2, _l3)\
boolean _name(_l0, _l1, _l2, _l3);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_4_1(_name, _l0, _l1, _l2, _l3, _r0)\
void _name(_l0, _l1, _l2, _l3, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_4_1(_name, _l0, _l1, _l2, _l3, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_4_2(_name, _l0, _l1, _l2, _l3, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_4_2(_name, _l0, _l1, _l2, _l3, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_4_3(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_4_3(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_4_4(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_4_4(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_4_5(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_4_5(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_4_6(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_4_6(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_4_7(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_4_7(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_4_8(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_4_8(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_4_9(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_4_9(_name, _l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_5_0(_name, _l0, _l1, _l2, _l3, _l4)\
void _name(_l0, _l1, _l2, _l3, _l4);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_5_0(_name, _l0, _l1, _l2, _l3, _l4)\
boolean _name(_l0, _l1, _l2, _l3, _l4);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_5_1(_name, _l0, _l1, _l2, _l3, _l4, _r0)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_5_1(_name, _l0, _l1, _l2, _l3, _l4, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_5_2(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_5_2(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_5_3(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_5_3(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_5_4(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_5_4(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_5_5(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_5_5(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_5_6(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_5_6(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_5_7(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_5_7(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_5_8(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_5_8(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_5_9(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_5_9(_name, _l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_6_0(_name, _l0, _l1, _l2, _l3, _l4, _l5)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_6_0(_name, _l0, _l1, _l2, _l3, _l4, _l5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_6_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_6_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_6_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_6_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_6_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_6_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_6_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_6_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_6_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_6_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_6_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_6_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_6_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_6_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_6_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_6_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_6_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_6_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_7_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_7_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_7_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_7_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_7_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_7_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_7_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_7_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_7_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_7_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_7_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_7_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_7_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_7_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_7_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_7_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_7_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_7_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_7_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_7_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_8_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_8_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_8_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_8_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_8_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_8_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_8_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_8_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_8_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_8_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_8_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_8_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_8_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_8_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_8_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_8_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_8_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_8_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_8_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_8_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define CONTINUATION_9_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *))n;\
}

#define FCONTINUATION_9_0(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8);\
struct _continuation_##_name{\
   void (*_apply)(void *);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *))n;\
}

#define CONTINUATION_9_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0))n;\
}

#define FCONTINUATION_9_1(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0))n;\
}

#define CONTINUATION_9_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define FCONTINUATION_9_2(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1))n;\
}

#define CONTINUATION_9_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define FCONTINUATION_9_3(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2))n;\
}

#define CONTINUATION_9_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define FCONTINUATION_9_4(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3))n;\
}

#define CONTINUATION_9_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define FCONTINUATION_9_5(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4))n;\
}

#define CONTINUATION_9_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define FCONTINUATION_9_6(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5))n;\
}

#define CONTINUATION_9_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define FCONTINUATION_9_7(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6))n;\
}

#define CONTINUATION_9_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6, r7);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define FCONTINUATION_9_8(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6, r7)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7))n;\
}

#define CONTINUATION_9_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
void _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   _name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6, r7, r8);\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

#define FCONTINUATION_9_9(_name, _l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8)\
boolean _name(_l0, _l1, _l2, _l3, _l4, _l5, _l6, _l7, _l8, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
struct _continuation_##_name{\
   void (*_apply)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8);\
   char *name;\
   _l0 l0;\
   _l1 l1;\
   _l2 l2;\
   _l3 l3;\
   _l4 l4;\
   _l5 l5;\
   _l6 l6;\
   _l7 l7;\
   _l8 l8;\
   heap h;\
};\
static void _apply_##_name(void *z, _r0 r0, _r1 r1, _r2 r2, _r3 r3, _r4 r4, _r5 r5, _r6 r6, _r7 r7, _r8 r8){\
   struct _continuation_##_name *n = z;\
   if (_name(n->l0, n->l1, n->l2, n->l3, n->l4, n->l5, n->l6, n->l7, n->l8, r0, r1, r2, r3, r4, r5, r6, r7, r8)) deallocate(n->h, n, sizeof(struct _continuation_##_name));\
}\
static void (**_fill_##_name(struct _continuation_##_name* n, heap h, _l0 l0, _l1 l1, _l2 l2, _l3 l3, _l4 l4, _l5 l5, _l6 l6, _l7 l7, _l8 l8))(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8){\
   n->_apply = _apply_##_name;\
   n->name = #_name;\
   n->l0 = l0;\
   n->l1 = l1;\
   n->l2 = l2;\
   n->l3 = l3;\
   n->l4 = l4;\
   n->l5 = l5;\
   n->l6 = l6;\
   n->l7 = l7;\
   n->l8 = l8;\
   n->h = h;\
   return (void (**)(void *, _r0, _r1, _r2, _r3, _r4, _r5, _r6, _r7, _r8))n;\
}

