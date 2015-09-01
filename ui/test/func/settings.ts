"use strict";
/// <reference path="../include/util.ts" />
module Test {
  declare var casper:CasperUtil;
  let editorUrl = `${casper.__env.baseUrl}/editor`;
  let util = casper.__util;

  module Settings {
    casper.test.begin("ensure settings panel opens when clicked and tabs work.", 6, function(test:Tester) {
      let settingsPane = util.pane.select("settings");
      let defaultTab = "preferences";
      let tabs = ["save", "load", "preferences"];
      return casper.start(editorUrl)
        .then(() => casper.viewport(960, 1200))
        .waitForSelector(util.pane.select("itemSelector"))
        .thenClick(util.action.select("settings"))
        .waitForSelector(settingsPane)
        .then(() => test.assertSelectorExists(settingsPane))
        .then(() => casper.capture("settings/settings-pane", undefined))
        .then(() => test.assert(util.item.tab.count() === tabs.length, `Settings tabbed box should have ${tabs.length} tabs.`))
        .then(() => test.assert(util.item.tab.selected(defaultTab, undefined, settingsPane),
                                              `Default selected tab should be "${defaultTab}"`))
        .each(tabs, function(self, tab, ix) {
          let sel = util.item.tab.select(tab);
          self.thenClick(sel)
          .waitFor(() => util.item.tab.selected(tab))
          .then(() => test.assert(util.item.tab.selected(tab), `Clicking tab "${tab}" should select it.`))
          .then(() => casper.capture(`settings/settings-pane-${tab}-tab`, undefined))
        })
        .run(() => test.done());
    });
  }
}