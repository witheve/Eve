#!/bin/bash

waitUrl="`pwd`/ui/waiting-room.html";

hash npm 2>/dev/null || { echo >&2 "I require npm but it's not installed. Aborting."; exit 1; }

pushd .
  # Ensure typescript compiler is present and compile UI
  cd ui
  if hash tsc 2>/dev/null; then
    tsc
  else
    if hash npm 2>/dev/null; then
      npm install -g typescript
      tsc
    else
      echo >&2 "I require typescript, but it's not installed. Please install tsc itself or npm and this script will install tsc for you. Aborting."
      exit 1;
    fi
  fi
popd

# If we aren't restarting, open the editor in the user's preferred browser
if [[ "x$1" != "x--restart" ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$waitUrl"
  else
    xdg-open "$waitUrl"
  fi
fi

if hash multirust 2>/dev/null; then
  pushd .
    # Ensure rustc is updated and compile backend
    cd runtime
    multirust override nightly-2015-08-10
    if [[ "x$1" == "x--debug" ]]; then
      RUST_BACKTRACE=1 cargo run --bin=server
    else
      RUST_BACKTRACE=1 cargo run --bin=server --release
    fi
  popd
else
  echo >&2 "I require multirust, but it's not installed. Aborting."
  exit 1;
fi

