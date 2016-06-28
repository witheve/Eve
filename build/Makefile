LIBLUAJIT = /usr/local/lib/libluajit-5.1.a
LUAJIT_INCLUDES = /usr/local/include/luajit-2.1

PLATFORM = $(shell uname)

ifeq ($(PLATFORM), Darwin)
  LINK += -pagezero_size 10000 -image_base 100000000
  S = _
endif

ifeq ($(PLATFORM), Linux)
  LINK += -Wl,-E
endif

all: lueve

VPATH += ..
VPATH += ../csrc/unix
VPATH += ../csrc/core
VPATH += ../csrc/http
VPATH += ../csrc/crypto
VPATH += ../csrc/luautf8
VPATH += ../csrc/luapower
VPATH += ../src
VPATH += ../csrc

LUAPOWER = bundle.o
UTF = lutf8lib.o
COMPILER = compiler.o error.o fs.o parser.o util.o set.o color.o build.o implicationResolver.o db.o
UNIX =  unix_util.o region.o select.o tcp_socket.o process.o
UNIX_H = unix_internal.h unix.h
CORE = buffer.o table.o vector.o format.o rolling.o string.o pqueue.o timer.o
CORE_H = bswap.h pqueue.h vector.h buffer.h heap.h timer.h continuation.h core.h string.h table.h
RUNTIME =  edb.o init.o uuid.o estring.o types.o luanne.o json_request.o exec.o runner.o
RUNTIME_H = ./luanne.h ./runtime.h ./estring.h ./number.h ./types.h
HTTP = server.o websocket.o base64.o sha1.o
HTTP_H = ./http/http.h

continuation_templates.h: continuations.py
	python $^ 9 9 continuation_templates.h

lutf8lib.o: lutf8lib.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

bundle.o: bundle.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

index.o: ../index.html
	cc wrap.S -DSTART=$(S)index_start -DEND=$(S)index_end -DFILE='"$<"' -c -o $@

renderer.o: ../jssrc/renderer.js
	cc wrap.S -DSTART=$(S)renderer_start -DEND=$(S)renderer_end -DFILE='"$<"' -c -o $@

microReact.o: ../jssrc/microReact.js
	cc wrap.S -DSTART=$(S)microReact_start -DEND=$(S)microReact_end -DFILE='"$<"' -c -o $@

codemirror.o: ../jssrc/codemirror.js
	cc wrap.S -DSTART=$(S)codemirror_start -DEND=$(S)codemirror_end -DFILE='"$<"' -c -o $@
codemirrorCss.o: ../jssrc/codemirror.css
	cc wrap.S -DSTART=$(S)codemirrorCss_start -DEND=$(S)codemirrorCss_end -DFILE='"$<"' -c -o $@

%.o: %.c continuation_templates.h $(UNIX_H) $(CORE_H) $(RUNTIME_H) $(HTTP_H)
	cc -std=gnu99 -I../csrc/unix -I../csrc/core -I../csrc -I. -I$(LUAJIT_INCLUDES) -g -c $<

%.o: %.lua %.lua
	luajit -b -g $< $@

# luajit has decided that they really need to use the specific part of the
# address space where other people normally live..no idea why, but move
# the executable out of the way for the moment
#macosx
#linux  -Wl,-E
lueve: $(CORE) $(UNIX) $(COMPILER) $(UTF) $(LUAPOWER) $(HTTP) $(RUNTIME) index.o renderer.o microReact.o codemirror.o codemirrorCss.o lueve.o
	cc $(LINK) $^ $(LIBLUAJIT) -lm -ldl  -o $@

clean:
	rm -f *.o lueve continuation_templates.h
