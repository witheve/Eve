

LIBLUA = /usr/local/lib/liblua.a
LIBLUAJIT = /usr/local/lib/libluajit-5.1.a

all: lueve

VPATH += ..
VPATH += ../unix
VPATH += ../../src
COMPILER = color.o compiler.o error.o fs.o parser.o util.o
UNIX =  unix_util.o region.o select.o #tcp_socket.o
CORE = buffer.o table.o types.o vector.o format.o rolling.o edb.o init.o luanne.o string.o uuid.o

continuation_templates.h:
	python ../continuations.py 8 8 continuation_templates.h

%.o: %.c continuation_templates.h
	cc -std=c99 -I../unix -I.. -I. -g -c $<

%.o: %.lua 
	luajit  -b $< $@


# luajit has decided that they really need to use the specific part of the
# address space where other people normally live..no idea why, but move
# the executable out of the way for the moment
lueve: $(CORE) $(UNIX) $(COMPILER) lueve.o
	cc -pagezero_size 10000 -image_base 100000000  $^ $(LIBLUAJIT) -o $@

clean:
	rm -f *.o lueve continuation_templates.h
