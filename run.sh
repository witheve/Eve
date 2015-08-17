#!/bin/sh

waitUrl="`pwd`/ui/waiting-room.html";

pushd .
  # Ensure typescript compiler is present and compile UI
  cd ui
  if hash tsc 2>/dev/null; then
    tsc
  else
    npm install -g typescript
    tsc
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
