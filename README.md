# lueve
Eve in Lua

## Getting started

Install lua, on OSX:

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
