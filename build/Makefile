LUAJIT_INSTALL = /usr/local
LUAJIT = $(LUAJIT_INSTALL)/bin/luajit-2.1.0-beta2
LIBLUAJIT = $(LUAJIT_INSTALL)/lib/libluajit-5.1.a
LUAJIT_INCLUDES = $(LUAJIT_INSTALL)/include/luajit-2.1
BUILD = $(CURDIR)

PLATFORM = $(shell uname)

ifeq ($(PLATFORM), Darwin)
  LINK += -pagezero_size 10000 -image_base 100000000 -Wl,-no_pie
  INCLUDES += --include ../csrc/unix/darwin.h
  S = _
endif

ifeq ($(PLATFORM), Linux)
  LINK += -Wl,-E
endif

all: eve

VPATH += ..
VPATH += ../csrc/unix
VPATH += ../csrc/core
VPATH += ../csrc/http
VPATH += ../csrc/crypto
VPATH += ../csrc/luautf8
VPATH += ../csrc/luapower
VPATH += ../csrc/dns
VPATH += ../src
VPATH += ../csrc

LUAPOWER = bundle.o
UTF = lutf8lib.o
COMPILER = compiler.o error.o fs.o parser.o util.o set.o color.o build.o implicationResolver.o db.o
UNIX =  unix_util.o region.o select.o tcp_socket.o process.o page.o udp.o filebag.o
UNIX_H = unix_internal.h unix.h
CORE = buffer.o table.o vector.o format.o rolling.o string.o pqueue.o timer.o field.o
CORE_H = bswap.h pqueue.h vector.h buffer.h heap.h timer.h continuation.h core.h string.h table.h
EXEC = exec_expression.o exec_edb.o exec_string.o exec_aggregate.o exec.o
RUNTIME = edb.o init.o uuid.o estring.o types.o luanne.o json_request.o runner.o request.o path.o $(EXEC)
RUNTIME_H = luanne.h runtime.h estring.h number.h types.h exec.h edb.h json_request.h
HTTP = server.o websocket.o base64.o sha1.o json.o client.o http.o hmac_sha2.o sha256.o
DNS = dns.o
HTTP_H = http.h
CONTENT = index.o system_js.o microReact_js.o codemirror_js.o codemirror_css.o commonmark_js.o todomvc_css.o  util_js.o client_js.o renderer_js.o editor_js.o db_js.o

luajit-2.0:
	git clone http://luajit.org/git/luajit-2.0.git

./lua/bin/luajit-2.1.0-beta2: luajit-2.0
	(cd luajit-2.0 ; git checkout v2.1.0-beta2 ; make PREFIX=$(BUILD)/lua; make install PREFIX=$(BUILD)/lua)

continuation_templates.h: continuations.py
	python $^ 9 9 continuation_templates.h

lutf8lib.o: lutf8lib.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

bundle.o: bundle.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

index.o: ../index.html
	cc wrap.S -DSTART=$(S)index_start -DEND=$(S)index_end -DFILE='"$<"' -c -o $@


../build/%.js: ../jssrc/%.ts
	cd .. && tsc --pretty

%_js.o: ../jssrc/%.js
	cc wrap.S -DSTART=$(S)$*_js_start -DEND=$(S)$*_js_end -DFILE='"$<"' -c -o $@
%_js.o: ../build/%.js
	cc wrap.S -DSTART=$(S)$*_js_start -DEND=$(S)$*_js_end -DFILE='"$<"' -c -o $@


%_css.o: ../jssrc/%.css
	cc wrap.S -DSTART=$(S)$*_css_start -DEND=$(S)$*_css_end -DFILE='"$<"' -c -o $@
%_css.o: ../examples/%.css
	cc wrap.S -DSTART=$(S)$*_css_start -DEND=$(S)$*_css_end -DFILE='"$<"' -c -o $@

path.c: Makefile
	echo 'char *pathroot = "$(BUILD)";' > path.c

%.o: %.c continuation_templates.h $(UNIX_H) $(CORE_H) $(RUNTIME_H) $(HTTP_H)
	cc -std=gnu99 -I../csrc/unix -I../csrc/core -I../csrc -I. $(INCLUDES) -I$(LUAJIT_INCLUDES) -g -c $<

%.o: %.lua $(LUAJIT)
	$(LUAJIT) -b -g $< $@

# luajit has decided that they really need to use the specific part of the
# address space where other people normally live..no idea why, but move
# the executable out of the way for the moment
#macosx
#linux  -Wl,-E
eve: $(CORE) $(UNIX) $(COMPILER) $(UTF) $(LUAPOWER) $(HTTP) $(RUNTIME) $(DNS) $(CONTENT) eve.o
	cc $(LINK) $^ $(LIBLUAJIT) -lm -ldl  -o $@

clean:
	rm -f *.o eve continuation_templates.h *.js *.js.map

distclean:
	make clean ; rm -rf lua luajit-2.0
