pushd .
  cd runtime
  multirust override nightly-2015-05-03
  RUST_BACKTRACE=1 cargo run --bin=server --release
popd
