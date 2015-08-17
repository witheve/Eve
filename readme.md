# Eve

Eve is a set of tools to help us think. Currently, those tools include a database, a temporal logic query language, and an IDE.

## Quick start

Eve relies on [TypeScript](http://www.typescriptlang.org/), [Rust Nightly](https://www.rust-lang.org/), and [multirust](https://github.com/brson/multirust). You'll want these installed, though our run.sh will attempt to install them for you.

```
bash run.sh
```

*we're working on a nice experience for windows, but we suggest trying to use cygwin and doing the above for now*

## Learn more

* [Intro Tutorial](http://witheve.github.io/Eve/tutorials/intro%20tutorial/tutorial.html)
* [Architecture overview and design documents](https://github.com/witheve/Eve/blob/master/design)
* [Rationale](https://github.com/witheve/Eve/blob/master/design/rationale.md)
* [A note on visual programming](https://github.com/witheve/Eve/blob/master/design/visualProgramming.md)

## Reach out

* [Mailing list](https://groups.google.com/forum/#!forum/eve-talk)
* [Twitter](https://twitter.com/with_eve)

## What's in version 0

In version 0, Eve includes a database server, a language compiler, a form-based data editor, and a node-based query editor. There's still a lot missing though:

* No UI Editor
* No state
* No version control / multiple people working together
* No security
* It's slow

This list will get smaller over time and some of it should disappear quickly, but this is definitely an early version and it's meant more for people to play around with than it is anything else at this point. It is going to continue to change pretty dramatically, but it's at a point where it's at least interesting to poke around in.

**DO NOT TRY TO BUILD PRODUCTION SOFTWARE WITH THIS** - It's full of dragons and other things that will eat your lunch, laundry, and any other l.*'s you have lying around.

## How to contribute

*By contributing code to Eve, you are agreeing to release it under the Apache 2.0 License.*

Eve is moving fast, so before contributing make sure to talk to us so that we can help guide you in the right direction and prevent you from working on something that we might be switching gears on.

When contributing:

* [Check out issues](https://github.com/witheve/Eve/labels/beginner) that are ready to be worked on. Feel free to ping a contributor if you need help along the way.
* For any other contributions, please discuss with us as early as possible. We want your work to count.
* We are not currently seeking refactoring contributions or code convention tweaks e.g. whitespace. This may change at a later point when we have automated tests and an explicit code convention.

## How to report a bug

When filing a bug on GitHub, please help us help you by including the following:

* *Steps to reproduce the bug.*
* Include a gist of the database in the issue (You can use the settings gear at the bottom, open the save panel, and hit the `save to gist` button to do this magically).
* Your operating system and Eve version.

If you manage to bring down the server, you can use one of the tools below to create a test and then submit it as a pull request.

If you just have questions, shoot those to the [mailing list](https://groups.google.com/forum/#!forum/eve-talk)!

### Internal tools

There are also a few simple internal tools that we've created to help create tests when things are broken.

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

##License

Eve is licensed under the Apache 2.0 license, see LICENSE for details.
