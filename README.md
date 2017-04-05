<p align="center">
  <img src="http://www.witheve.com/logo.png" alt="Eve logo" width="10%" />
</p>

---
 
Eve is a programming language based on years of research into building a human-first programming platform. 

**This repository hosts a preview of Eve v0.3 alpha, which is currently under active development. You can use Eve on its own or integrate it into an exixsting project, but be aware this preview contains bugs and lacks documentation. For help with this preview release, please contact the devlopers on the Eve [mailing list](https://groups.google.com/forum/#!forum/eve-talk)**

## Getting Started with Eve v0.3 preview

Install [Node](https://nodejs.org/en/download/) for your platform, then clone and build the [Eve starter repository](https://github.com/witheve/eve-starter):

```
git clone git@github.com:witheve/eve-starter.git
cd eve-starter
npm install
```

You can start the program switcher, which allows you to browse included example programs:

```
npm start
```

Or you can run a specific program by providing its path as an argument:

```
npm start -- path/to/program.js
```

## Integrating Eve into an existing project

You can get Eve as an npm package

```
npm install witheve@preview
```

Then inport Eve to use it in your project

```
import {program} from "witheve";
```

## Learning Eve

You can learn about Eve with the following resources:

- [Read the Quick Start Tutorial](http://play.witheve.com/) (use Chrome for best results)
- [Syntax Quick Reference](https://witheve.github.io/assets/docs/SyntaxReference.pdf)
- [Language Handbook (draft)](http://docs.witheve.com)

Also, the [mailing list archive](https://groups.google.com/forum/#!forum/eve-talk) is a good resource for help and inspiration. In particular, the [Puzzles & Paradoxes series](https://groups.google.com/forum/#!searchin/eve-talk/Puzzles$20$26$20Paradoxes%7Csort:date) answers a lot of questions beginners face about the Eve langauge.

## Get Involved

### Join the Community

The Eve community is small but constantly growing, and everyone is welcome!

- Join or start a discussion on our [mailing list](https://groups.google.com/forum/#!forum/eve-talk).
- Impact the future of Eve by getting involved with our [Request for Comments](https://github.com/witheve/rfcs) process.
- Read our [development blog](http://incidentalcomplexity.com/).
- Follow us on [Twitter](https://twitter.com/with_eve).

### How to Contribute

The best way to contribute right now is to write Eve code and report your experiences. [Let us know](https://groups.google.com/forum/#!forum/eve-talk) what kind of programs you’re trying to write, what barriers you are facing in writing code (both mental and technological), and any errors you encounter along the way.

### How to File an Issue

Please file any issues in this repository. Before you file an issue, please take a look to see if the issue already exists. When you file an issue, please include:

1. The steps needed to reproduce the bug
2. Your operating system and browser.
3. If applicable, the `.*eve` file that causes the bug.

## License

Eve is licensed under the Apache 2.0 license, see [LICENSE](https://github.com/witheve/eve/blob/master/LICENSE) for details.

## Disclaimer

Eve is currently at a very early, "alpha" stage of development. This means the language, tools, and docs are largely incomplete, but undergoing rapid and continuous development. If you encounter errors while using Eve, don't worry: it's likely our fault. Please bring the problem to our attention by [filing an issue](https://github.com/witheve/eve#how-to-file-an-issue).

As always, with pre-release software, don’t use this for anything important. We are continuously pushing to this codebase, so you can expect very rapid changes. At this time, we’re not prepared make the commitment that our changes will not break your code, but we’ll do our best to [update you](https://groups.google.com/forum/#!forum/eve-talk) on the biggest changes.
