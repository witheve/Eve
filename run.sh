#!/bin/bash

waitUrl="`pwd`/ui/waiting-room.html";

# Ensure dependencies are installed.
echo "* Checking dependencies..."
hash tsc 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install the typescript compiler with ('sudo npm install -g typescript') before continuing."
  exit
fi
hash multirust 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install multirust with ('./install-multirust.sh') before continuing."
  exit
fi

pushd .
  # Try using the typescript compiler (tsc) to compile UI
  echo "* Compiling Editor..."
  cd ui

  tsc
  if [ $? -ne 0 ]; then
   echo "Failed to compile editor, bailing."
   popd
   exit
  fi
popd

# If we aren't restarting, open the editor in the user's preferred browser
if [[ "x$1" != "x--restart" ]]; then
  echo "* Opening $waitUrl"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$waitUrl" &
  else
    xdg-open "$waitUrl" &
  fi
fi

pushd .
  # Ensure rustc is updated
  echo "* Updating rust if necessary..."
  cd runtime
  multirust override nightly-2015-08-10

  # Compile runtime server
  echo "* Compiling server... (This takes a while)"
  rustFlags="--release"
  if [[ "x$1" != "x--debug" ]]; then
    rustFlags=""
  fi

  RUST_BACKTRACE=1 cargo run --bin=server $rustFlags
popd
