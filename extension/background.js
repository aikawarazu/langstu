/* ===== 后台 Service Worker ===== */
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: 'nce-open-panel',
    title: '打开 NCE 学习侧栏',
    contexts: ['all']
  });
  chrome.contextMenus.create({
    id: 'nce-lookup',
    title: '在 NCE 词库中查询选中内容',
    contexts: ['selection']
  });
});

/* 打开侧栏（按窗口） */
function openPanel(windowId) {
  return new Promise(function (resolve) {
    chrome.sidePanel.open({ windowId: windowId }, function () { resolve(); });
  });
}

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var win = tab ? tab.windowId : undefined;
  if (info.menuItemId === 'nce-open-panel') {
    if (win != null) openPanel(win);
  } else   if (info.menuItemId === 'nce-lookup' && info.selectionText) {
    chrome.storage.session.set({ pendingQuery: info.selectionText.trim() });
    if (win != null) openPanel(win);
  }
});

/* 来自内容脚本：即点即译浮框「在侧栏查看本课」 */
chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg) return;
  if (msg.type === 'openLesson') {
    var win = sender && sender.tab ? sender.tab.windowId : undefined;
    var target = msg;
    // 先存 session（侧栏加载时读取，避免消息先于监听到达而丢失），再开面板；
    // 若面板已开，下面这条消息会被已注册的监听处理。
    chrome.storage.session.set({ pendingGoto: { pkg: target.pkg, unit: target.unit } });
    try { chrome.runtime.sendMessage({ type: 'goto', pkg: target.pkg, unit: target.unit }); } catch (e) { }
    if (win != null) openPanel(win);
  }
});
