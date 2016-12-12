<p align="center">
  <img src="http://www.witheve.com/logo.png" alt="Eve logo" width="10%" />
</p>

---
 
Eve is a programming language and IDE based on years of research into building a human-first programming platform. You can play with Eve online here: [play.witheve.com](http://play.witheve.com/).

[![Play With Eve](http://programming.witheve.com/images/eve.png)](http://play.witheve.com/)

## Installation

### From Source

You'll need a recent [node.js](https://nodejs.org) for your platform. Download the Eve source either by cloning this repository:


```
git clone https://github.com/witheve/Eve.git
```

or you can [download](https://github.com/witheve/Eve/archive/master.zip) the Eve source directly. To build and run Eve, run the following commands in the root Eve directory:

```
npm install
npm start
```

Then open `http://localhost:8080/` in your browser.

### From npm

Alternatively, you can download Eve directly from npm with the following command:

```
npm install witheve/eve
```

### From Docker

First, [download](https://www.docker.com/products/docker) and install Docker for your platform. To download and install the Eve container, run the following command:

```
docker run -p 8080:8080 witheve/eve
```

## How to use Eve

You can learn about Eve with the following resources:

- [Play with Eve in your browser](http://play.witheve.com/) (use Chrome for best results)
- [Syntax Quick Reference](https://witheve.github.io/assets/docs/SyntaxReference.pdf)
- [Eve Language Handbook (draft)](http://docs.witheve.com)

*Please let us know what kind of documents would be the most helpful as you begin your journey with Eve*. We want our documentation to be a highlight of the Eve experience, so any suggestions are greatly appreciated.

### Running Eve Programs in Server Mode

By default, Eve executes on the client browser. To instead execute your program on the server, launch Eve with the `--server` flag:   

```
npm start -- --server
```

## Get Involved

### Join the Community

The Eve community is small but constantly growing, and everyone is welcome!

- Join or start a discussion on our [mailing list](https://groups.google.com/forum/#!forum/eve-talk).
- Impact the future of Eve by getting involved with our [Request for Comments](https://github.com/witheve/rfcs) process.
- Read our [development blog](http://incidentalcomplexity.com/).
- Follow us on [Twitter](https://twitter.com/with_eve).

### How to Contribute

The best way to contribute right now is to write Eve code and report your experiences. Let us know what kind of programs you’re trying to write, what barriers you are facing in writing code (both mental and technological), and any errors you encounter along the way. Also, let us know what you love! What features are your favorite?

Another way to really help us is to host your `*.eve` files on Github, so we can get Eve recognized as an official language in the eyes of Github. Be sure to also send us a link to your repo!

### How to File an Issue

Please file any issues in this repository. Before you file an issue, please take a look to see if the issue already exists. When you file an issue, please include:

1. The steps needed to reproduce the bug
2. Your operating system and browser.
3. If applicable, the .*eve file that causes the bug.

## License

Eve is licensed under the Apache 2.0 license, see [LICENSE](https://github.com/witheve/eve/blob/master/LICENSE) for details.

## Disclaimer

Eve is currently at a very early, "alpha" stage of development. This means the language, tools, and docs are largely incomplete, but undergoing rapid and continuous development. If you encounter errors while using Eve, don't worry: it's likely our fault. Please bring the problem to our attention by [filing an issue](https://github.com/witheve/eve#how-to-file-an-issue).

As always, with pre-release software, don’t use this for anything important. We are continuously pushing to this codebase, so you can expect very rapid changes. At this time, we’re not prepared make the commitment that our changes will not break your code, but we’ll do our best to [update you](https://groups.google.com/forum/#!forum/eve-talk) on the biggest changes.
