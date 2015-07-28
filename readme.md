# Internal tools

Take a working events file and add a test that asserts that the output doesn't change in future versions:

```
cargo run --release --bin=migrate make_regression_test
```

Take a broken events file and add a test that asserts that it doesn't crash:

```
cargo run --release --bin=migrate make_bug_test
```
