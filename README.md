<img src="http://www.witheve.com/logo.png" width="10%">

Eve is a set of tools to help us think. Currently, these tools include: a temporal query language, a database, and a lightweight web-REPL.

## Disclaimer

Eve is currently at a very early, "pre-alpha" stage of development. This means the language, tools, and docs are largely incomplete, but undergoing rapid and continuous development. If you encounter errors while using Eve, don't worry: it's likely our fault. Please bring the problem to our attention by [filing an issue](https://github.com/witheve/eve#how-to-file-an-issue).

As always, with pre-release software, don’t use this for anything important. We are continuously pushing to this codebase, so you can expect very rapid changes. At this time, we’re not prepared make the commitment that our changes will not break your code, but we’ll do our best to [update you](https://groups.google.com/forum/#!forum/eve-talk) on the biggest changes.

## Installation

### From Source

To build Eve from source, you'll need LuaJIT, gcc, make, and python. Currently, building from source is only supported on Linux and OSX. On Windows, we've managed to compile Eve in cygwin, but have not gotten it to run yet. Contributions are welcome on this front.

Install luajit by downloading [LuaJIT-2.1.0-beta2](http://luajit.org/download.html) and then in the LuaJIT directory:

```
make
make install
```

By default, LuaJIT is not added to your path, so you'll need to do that as well:

```
ln -sf luajit-2.1.0-beta2 /usr/local/bin/luajit
```

then in the `eve/build` directory:

```
make && ./eve
```

### Docker

We have a Docker container. Docker for Windows requires Microsoft Hyper-V, so you'll need Windows 10 to run this. You just provide a port on your machine and a .eve file to compile and run:

```
docker run -p [port]:8080 witheve/eve [eve_file]
```

Now just point your browser to `http://localhost:[port]/`

## Running

To run Eve, execute `./eve` in the `eve/build` directory. This launches a server at `http://localhost:8080`. You can point your browser there to access the web-REPL. To execute an `*.eve` file, add its path as an argument. e.g. `./eve [path]`. You can configure the port with the `--port` flag. e.g. `./eve --port 1234`.

To run the Docker container, execute `docker run -p [port]:8080 witheve/eve [path]`. Here, `[port]` is an available port on your local machine. It can be `8080` or any other port you would like. Then direct your browser to `http://localhost:[port]` to access the web-REPL.

## How to use Eve

The easiest way to use Eve is the web-REPL, which by default is accessible at `http://localhost:8080`. Read our [quickstart guide](TODO) for a brief introduction to Eve, and a tutorial for your first Eve program.

The [Syntax RFC](TODO) also acts as an interim tutorial while we work on something more complete.

Finally, you can communicate with Eve using websockets and a very simple [JSON protocol](TODO). For now, the web-REPL is the only tool that implements this protocol. 

*Please let us know what kind of documents would be the most helpful as you begin your journey with Eve*. We want our documentation to be a highlight of the Eve experience, so any suggestions are greatly appreciated.

## Learn More

## Get Involved

### Join the Community

The Eve community is small but constantly growing, and everyone is welcome!

- Join our [mailing list](https://groups.google.com/forum/#!forum/eve-talk) and get involved with the latest discussions on Eve.
- Impact the future of Eve by getting involved with our [Request for Comments](https://github.com/witheve/rfcs) process.
- Read our [development diary](http://incidentalcomplexity.com/).
- Follow us on [twitter](https://twitter.com/with_eve).

### How to Contribute

The best way to contribute right now is to write Eve code and report your experiences. Let us know what kind of programs you’re trying to write, what barriers your are facing in writing code (both mental and technological), and any errors you encounter along the way. Also, let us know what you love! What features are your favorite?

Another way to really help us is to host your `*.eve` files on Github, so we can get Eve recognized as an official language in the eyes of Github.

### How to File an Issue

Please file any issues in this repository. Before you file an issue, please take a look to see if the issue already exists. When you file an issue, please include:

1. The steps needed to reproduce the bug
2. Your operating system and browser.
3. If applicable, the .*eve file that causes the bug.

## License

Eve is licensed under the Apache 2.0 license, see [LICENSE](https://github.com/witheve/eve/blob/master/LICENSE) for details.
