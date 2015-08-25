"use strict";
/// <reference path="../include/util.ts" />
module Test {
  declare var casper:CasperUtil;
  let editorUrl = `${casper.__env.baseUrl}/editor`;
  let util = casper.__util;

  module ItemSelector {
    casper.test.begin("ensure editor defaults to itemSelector page.", 0, function(test:Tester) {
      return casper.start(editorUrl)
        .waitForSelector(util.pane.select("itemSelector"))
        .run(() => test.done());
    });

    casper.test.begin("ensure actions with no selection are correct.", 6, function(test:Tester) {
      let actions = ["addItem", "importItem", "removeItem"];
      let enabled = {addItem: true, importItem: true};

      return casper.start(editorUrl)
        .then(() => casper.viewport(960, 1200))
        .then(() => casper.capture("item-selector/no-selection", undefined))
        .then(() => util.assertActions(actions, enabled, test))
        .run(() => test.done());
    });

    casper.test.begin("ensure addItem > data creates a data item", 0, function(test:Tester) {
      return casper.start(editorUrl)
        .then(() => casper.viewport(960, 1200))
        .waitForSelector(util.pane.select("itemSelector"))
        .thenClick(util.action.select("addItem"))
        .waitForSelector(util.pane.select("addItem"))
        .then(() => casper.capture("item-selector/add-item-pane", undefined))
        .thenClick(util.action.select("addDataItem"))
        .waitForSelector(util.pane.select("dataEditor"))
        .then(() => casper.capture("item-selector/added-data-item", undefined))
        .run(() => test.done());
    });

    casper.test.begin("ensure addItem > query creates a query item", 0, function(test:Tester) {
      return casper.start(editorUrl)
        .then(() => casper.viewport(960, 1200))
        .waitForSelector(util.pane.select("itemSelector"))
        .thenClick(util.action.select("addItem"))
        .waitForSelector(util.pane.select("addItem"))
        .thenClick(util.action.select("addQueryItem"))
        .waitForSelector(util.pane.select("queryEditor"))
        .then(() => casper.capture("item-selector/added-query-item", undefined))
        .run(() => test.done());
    });

    casper.test.begin("ensure actions with selections are correct", 13, function(test:Tester) {
      let actions = ["addItem", "importItem", "removeItem"];
      let enabled = {addItem: true, importItem: true, removeItem: true};
      return casper.start(editorUrl)
        .then(() => casper.viewport(960, 1200))
        .waitForSelector(util.pane.select("itemSelector"))
        .then(() => test.assert(util.item.count() === 2, `Should contain 2 items, currently contains: ${util.item.count()}`))
        .thenClick(util.item.select("data"))
        .waitFor(() => util.item.selectionCount() === 1)
        .then(() => casper.capture("item-selector/selected-data-item", undefined))
        .then(() => util.assertActions(actions, enabled, test))
        .then(() => util.shiftClick(util.item.select("query"), true))
        .waitFor(() => util.item.selectionCount() === 2)
        .then(() => casper.capture("item-selector/selected-multi", undefined))
        .then(() => util.assertActions(actions, enabled, test))
        .run(() => test.done());
    });
  }

  casper.test.begin("ensure removeItem works", 2, function(test:Tester) {
    return casper.start(editorUrl)
      .then(() => casper.viewport(960, 1200))
      .waitForSelector(util.pane.select("itemSelector"))
      .thenClick(util.item.select(undefined, 1))
      .waitFor(() => util.item.selectionCount() === 1)
      .thenClick(util.action.select("removeItem"))
      .waitFor(() => util.item.count() === 1)
      .then(() => test.assert(util.item.count() === 1, `Should contain 1 item, currently contains: ${util.item.count()}`))
      .thenClick(util.item.select(undefined, 1))
      .waitFor(() => util.item.selectionCount() === 1)
      .thenClick(util.action.select("removeItem"))
      .waitFor(() => util.item.count() === 0)
      .then(() => test.assert(util.item.count() === 0, `Should contain 0 items, currently contains: ${util.item.count()}`))
      .run(() => test.done());
  })
}

