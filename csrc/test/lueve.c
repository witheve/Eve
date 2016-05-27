#include <runtime.h>
#include <unix.h>

int main(int argc, char **argv)
{
    init_runtime();
    interpreter c = build_lua();
    lua_run_file(c, argv[1]);
}
