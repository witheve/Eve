"use strict";
/// <reference path="../include/env.ts" />
module Test {
  declare var casper:CasperEnv;
  let waitingRoomUrl = `${casper.__env.basePath}/ui/waiting-room.html`;
  let editorUrl = `${casper.__env.baseUrl}/editor`;

  module WaitingRoom {
    casper.test.begin("waiting room redirects to editor", 1, function(test:Tester) {
      return casper.start(waitingRoomUrl)
        .then(() => casper.viewport(960, 1200))
        .then(() => casper.capture("waiting-room/pre-redirect", undefined))
        .then(() => casper.waitForUrl(editorUrl, undefined, undefined, 12000))
        .then(() => test.assertHttpStatus(200))
        .then(() => casper.capture("waiting-room/post-redirect", undefined))
        .run(() => test.done())
    });
  }
}

