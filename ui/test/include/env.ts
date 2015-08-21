"use strict";
/// <reference path="../../typings/casperjs/casperjs.d.ts" />

module Test {
  export interface CasperEnv extends Casper {
    cli:{options:any, args:any[]}
    __env?:any
  }
  declare var casper:CasperEnv;

  // https://github.com/creativelive/spook/#saving-screenshots
  let _capture = casper.capture.bind(casper);
  if(casper.cli.options.disableCapture) {
    console.log("Disabling capture due to --disableCapture.");
    casper.capture = function() { return this; }
  } else {
    casper.capture = function capture(targetFilepath, clipRect?, opts?) {
      opts = opts || {};
      opts.format = opts.format || 'jpg';
      opts.quality = opts.quality || 75;
      console.log('saving screenshot ' + targetFilepath + '.' + opts.format);
      return _capture(casper.cli.options.output + '/' + targetFilepath + '.' + opts.format, clipRect, opts);
    };
  }

  casper.__env = {
    basePath: casper.cli.options.basePath,
    baseUrl: casper.cli.options.baseUrl || "localhost:8080"
  };
}
