# Internal tools

Take a working events file and add a test that asserts that the output doesn't change in future versions:

```
cargo run --release --bin=migrate make_regression_test
```

Take a broken events file and add a test that asserts that it doesn't crash:

```
cargo run --release --bin=migrate make_bug_test
```

Remove all changes to a view from all events files:

```
cargo run --release --bin=migrate remove_view 'block field'
```

Remove a specific row from a view from all events files:

```
cargo run --release --bin=migrate remove_row 'tag' '["block field", "editor"]'
```