pushd .
  cd ui
  if hash tsc 2>/dev/null; then
        tsc
  else
        npm install -g typescript
        tsc
  fi
popd
pushd .
  cd runtime
  multirust override nightly-2015-08-10
  if [ "x$1" = "x--debug" ]; then
    RUST_BACKTRACE=1 cargo run --bin=server
  else
    RUST_BACKTRACE=1 cargo run --bin=server --release
  fi
popd
