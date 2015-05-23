pushd .
  cd runtime
  multirust override nightly-2015-05-14
  if [ "x$1" = "x--debug" ]; then
    RUST_BACKTRACE=1 cargo run --bin=server
  elif [ "x$1" = "x--clean" ]; then
    RUST_BACKTRACE=1 cargo run --bin=server clean
  else
    RUST_BACKTRACE=1 cargo run --bin=server --release
  fi
popd
