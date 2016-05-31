

LIBLUA = /usr/local/lib/liblua.a
LIBLUAJIT = /usr/local/lib/libluajit-5.1.a
LUAJIT_INCLUDES = /usr/local/include/luajit-2.1


all: lueve

VPATH += ..
VPATH += ../unix
VPATH += ../http
VPATH += ../crypto
VPATH += ../luautf8
VPATH += ../luapower
VPATH += ../../src

LUAPOWER = bundle.o
UTF = lutf8lib.o
COMPILER = compiler.o error.o fs.o parser.o util.o set.o color.o build.o
UNIX =  unix_util.o region.o select.o tcp_socket.o
CORE = buffer.o table.o types.o vector.o format.o rolling.o edb.o init.o luanne.o string.o uuid.o\
       pqueue.o timer.o
HTTP = server.o websocket.o base64.o sha1.o

continuation_templates.h:
	python ../continuations.py 8 8 continuation_templates.h

lutf8lib.o: lutf8lib.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

bundle.o: bundle.c
	cc -std=c99 -c -g -I$(LUAJIT_INCLUDES) $^

%.o: %.c continuation_templates.h
	cc -std=c99 -I../unix -I.. -I. -I$(LUAJIT_INCLUDES) -g -c $<

%.o: %.lua %.lua
	luajit -b -g $< $@


# luajit has decided that they really need to use the specific part of the
# address space where other people normally live..no idea why, but move
# the executable out of the way for the moment
#macosx 
#linux  -Wl,-E
lueve: $(CORE) $(UNIX) $(COMPILER) $(UTF) $(LUAPOWER) $(HTTP) lueve.o
	cc -pagezero_size 10000 -image_base 100000000 $^ $(LIBLUAJIT) -lm -ldl  -o $@

clean:
	rm -f *.o lueve continuation_templates.h
