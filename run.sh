pushd .
  cd runtime
  RUST_BACKTRACE=1 multirust run nightly-2015-04-20 cargo run --bin=server --release
popd
