pushd .
  cd runtime
  RUST_BACKTRACE=1 cargo run --bin=server --release
popd
