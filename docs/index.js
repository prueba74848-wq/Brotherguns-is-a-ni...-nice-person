(function () {
  "use strict";
  var module = { exports: {} };

  var vd = vendetta;
  var metro = vd.metro;
  var patcher = vd.patcher;
  var common = metro.common;
  var utils = vd.utils;
  var assets = vd.ui.assets;
  var toasts = vd.ui.toasts;
  var logger = vd.logger;
  var React = common.React;

  var ActionSheet = metro.findByProps("openLazy", "hideActionSheet");
  var ActionSheetRowModule = metro.findByProps("ActionSheetRow");
  var ActionSheetRow = ActionSheetRowModule && ActionSheetRowModule.ActionSheetRow;

  function firstAsset(names) {
    for (var i = 0; i < names.length; i++) {
      var id = assets.getAssetIDByName(names[i]);
      if (id) return id;
    }
    return undefined;
  }

  var CopyIcon = firstAsset(["copy", "ic_copy", "ic_message_copy", "ic_copy_message_link", "ic_link"]);

  function toast(text) {
    try {
      toasts.showToast(text, assets.getAssetIDByName("Small"));
    } catch (e) {
      logger.log("[Copy Sticker ID] toast failed: " + String(e));
    }
  }

  function copyToClipboard(text) {
    try {
      var cb = common.clipboard || metro.findByProps("setString", "getString");
      if (cb && typeof cb.setString === "function") {
        cb.setString(text);
        return true;
      }
    } catch (e) {
      logger.log("[Copy Sticker ID] clipboard failed: " + String(e));
    }
    return false;
  }

  // Messages carry stickers as stickerItems (client) or sticker_items (raw API)
  function getStickers(message) {
    var list = (message && (message.stickerItems || message.sticker_items)) || [];
    return Array.isArray(list) ? list.filter(function (s) { return s && s.id; }) : [];
  }

  var unpatchOpenLazy = null;

  module.exports = {
    onLoad: function () {
      if (!ActionSheet || !ActionSheetRow) {
        toast("Copy Sticker ID: could not find the message menu on this device");
        return;
      }

      unpatchOpenLazy = patcher.before("openLazy", ActionSheet, function (callArgs) {
        var comp = callArgs[0];
        var args = callArgs[1];
        var msg = callArgs[2];
        if (args !== "MessageLongPressActionSheet" || !msg || !msg.message) return;

        var stickers = getStickers(msg.message);
        if (!stickers.length) return;

        comp.then(function (instance) {
          var unpatch = patcher.after("default", instance, function (_, component) {
            React.useEffect(function () {
              return function () { unpatch(); };
            }, []);

            var groups = utils.findInReactTree(component, function (c) {
              return Array.isArray(c) && c[0] && c[0].type && c[0].type.name === "ActionSheetRowGroup";
            });
            if (!groups || !groups.length) {
              logger.warn("[Copy Sticker ID] Could not find ActionSheetRowGroups");
              return;
            }

            var ids = stickers.map(function (s) { return s.id; }).join(",");
            var rowProps = {
              label: stickers.length > 1 ? "Copy sticker IDs" : "Copy sticker ID",
              onPress: function () {
                ActionSheet.hideActionSheet();
                if (copyToClipboard(ids)) {
                  var name = stickers.length === 1 && stickers[0].name ? " (" + stickers[0].name + ")" : "";
                  toast("Copied sticker ID" + (stickers.length > 1 ? "s" : "") + name);
                } else {
                  toast("Could not copy: " + ids);
                }
              }
            };
            if (CopyIcon && ActionSheetRow.Icon) {
              rowProps.icon = React.createElement(ActionSheetRow.Icon, { source: CopyIcon });
            }
            var button = React.createElement(ActionSheetRow, rowProps);

            for (var i = 0; i < groups.length; i++) {
              var rows = utils.findInReactTree(groups[i], function (c) {
                return Array.isArray(c) && c.some(function (child) {
                  return child && child.type && child.type.name === "ActionSheetRow";
                });
              });
              if (rows) {
                rows.unshift(button);
                return;
              }
            }
            groups.splice(0, 0, React.createElement(ActionSheetRow.Group, null, button));
          });
        });
      });

      logger.log("[Copy Sticker ID] Loaded.");
    },
    onUnload: function () {
      if (unpatchOpenLazy) unpatchOpenLazy();
      unpatchOpenLazy = null;
      logger.log("[Copy Sticker ID] Unloaded.");
    }
  };

  return module.exports;
})();
