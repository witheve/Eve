# lueve
Eve in Lua

## Getting started

Install lua

### OSX

```
brew install --devel --with-52compat luajit
brew install lua51
```

Then grab the luarocks we use and run!

```
./getRocks.sh
./run.sh
```

On OSX if you get a build error about openssl, do the following

```
xcode-select --install
brew uninstall openssl
brew install openssl
brew link openssl --force
```

### Windows

On windows you can either install from source, or use a precompiled binary. Binaries for Lua 5.1 can be found [here](https://sourceforge.net/projects/luabinaries/files/5.1.5/Tools%20Executables/)
