# Eve

Eve is a set of tools to help us think. Currently, those tools include a database, a temporal logic query language, and an IDE.

## Quick start

Eve relies on [TypeScript](http://www.typescriptlang.org/), node.js, and leiningen

```
npm install
npm run dev
cd server/
lein run
```

Now go to `localhost:8081/repl` you can login with eve/eve

## Learn more

* [Rationale](https://github.com/witheve/Eve/blob/master/design/rationale.md)
* [A note on visual programming](https://github.com/witheve/Eve/blob/master/design/visualProgramming.md)

## Reach out

* [Mailing list](https://groups.google.com/forum/#!forum/eve-talk)
* [Twitter](https://twitter.com/with_eve)

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

If you just have questions, shoot those to the [mailing list](https://groups.google.com/forum/#!forum/eve-talk)!

##License

Eve is licensed under the Apache 2.0 license, see LICENSE for details.

## Installation FAQ

### Install fails on Ubuntu with error:
```
Eve requires tsc version "1.6.0-dev.20150731" but "" is installed.
```

Solution: This is not actually an error with the Typescript install, but a linking error with Node. In Ubuntu, the standard Node.js package is called nodejs, whereas on every other platform it is called node. Creating a symlink from nodejs to node solves the issues. e.g.
```
sudo ln -s /usr/bin/nodejs /usr/bin/node
```

