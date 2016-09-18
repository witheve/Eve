## to download and install a dedicated copy of luajit:
LUAJIT_INSTALL = ./lua
#LUAJIT_INSTALL = /usr/local
LUAJIT = $(LUAJIT_INSTALL)/bin/luajit-2.1.0-beta2
LIBLUAJIT = $(LUAJIT_INSTALL)/lib/libluajit-5.1.a
LUAJIT_INCLUDES = $(LUAJIT_INSTALL)/include/luajit-2.1
BUILD = $(CURDIR)

#find a better way to do this
.SECONDARY: ../build/client.js ../build/editor.js ../build/renderer.js ../build/util.js

PLATFORM = $(shell uname)

ifeq ($(PLATFORM), Darwin)
  LINK += -pagezero_size 10000 -image_base 100000000 -Wl,-no_pie
  INCLUDES += --include ../csrc/unix/darwin/darwin.h
  S = _
endif

ifeq ($(PLATFORM), Linux)
  LINK += -Wl,-E -lpthread
  INCLUDES += --include ../csrc/unix/linux/linux.h
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
VPATH += ../jssrc
VPATH += ../src
VPATH += ../csrc

CFLAGS = -g

opt: eve
opt: CFLAGS = -O2

LUAPOWER = bundle.o
UTF = lutf8lib.o
COMPILER = compiler.o error.o fs.o parser.o util.o set.o color.o build.o implicationResolver.o db.o
UNIX =  unix_util.o region.o select.o tcp_socket.o process.o page.o udp.o filebag.o
UNIX_H = unix_internal.h unix.h
CORE = buffer.o table.o vector.o format.o rolling.o string.o pqueue.o timer.o field.o
CORE_H = bswap.h pqueue.h vector.h buffer.h heap.h timer.h continuation.h core.h string.h table.h
EXEC = exec_expression.o exec_edb.o exec_string.o exec_aggregate.o exec.o
RUNTIME = edb.o init.o uuid.o estring.o types.o luanne.o json_request.o runner.o path.o\
	  process_bag.o bag_bag.o serialize.o postgres.o debug_bag.o envbag.o thread.o log.o $(EXEC) 
RUNTIME_H = luanne.h runtime.h estring.h number.h types.h exec.h edb.h multibag.h
HTTP = server.o websocket.o base64.o sha1.o json.o client.o http.o hmac_sha2.o sha256.o md5.o
DNS = dns.o
HTTP_H = http.h
CONTENT = index.html system.js microReact.js codemirror.js codemirror.css commonmark.js\
          uuid.js client.js renderer.js editor.js db.js

luajit-2.0:
	git clone http://luajit.org/git/luajit-2.0.git

./lua/bin/luajit-2.1.0-beta2: luajit-2.0
	(cd luajit-2.0 ; git checkout v2.1.0-beta2 ; make PREFIX=$(BUILD)/lua; make install PREFIX=$(BUILD)/lua)

contgen: contgen.c
	cc $< -g -o $@

continuation_templates.h: contgen
	contgen 10 10 > continuation_templates.h

lutf8lib.o: lutf8lib.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

bundle.o: bundle.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^


%.js: $(BUILD)/../jssrc/%.ts
	cd .. && tsc --pretty

path.c: Makefile
	echo 'char *pathroot = "$(BUILD)/../";' > path.c

package: package.o path.o
	cc $^ -o $@

staticdb: $(DB_INCLUDES) package $(CONTENT) manifest
	package < manifest > staticdb

staticdb.o: staticdb
	cc wrap.S -DSTART=$(S)db_start -DEND=$(S)db_end -DFILE='"$<"' -c -o $@

%.o: %.c continuation_templates.h $(UNIX_H) $(CORE_H) $(RUNTIME_H) $(HTTP_H)
	cc -std=gnu99 -I../csrc/unix -I../csrc/core -I../csrc -I. $(INCLUDES) -I$(LUAJIT_INCLUDES) $(CFLAGS) -c $<

%.o: %.lua $(LUAJIT)
	$(LUAJIT) -b -g $< $@

# luajit has decided that they really need to use the specific part of the
# address space where other people normally live..no idea why, but move
# the executable out of the way for the moment
#macosx
#linux  -Wl,-E
eve: $(CORE) $(UNIX) $(COMPILER) $(UTF) $(LUAPOWER) $(HTTP) $(RUNTIME) $(DNS) staticdb.o eve.o
	cc $^ $(LIBLUAJIT) $(LINK) -lm -ldl  -o $@

clean:
	rm -f *.o eve continuation_templates.h *.js *.js.map db

distclean:
	make clean ; rm -rf lua luajit-2.0
