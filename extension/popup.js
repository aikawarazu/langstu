/* ===== 工具栏弹窗 ===== */
function openPanelThen(setSession) {
  if (setSession) setSession(); // 先存 session，面板加载时读取
  chrome.windows.getCurrent(function (w) {
    chrome.sidePanel.open({ windowId: w.id });
  });
}

document.getElementById('ppOpen').onclick = function () { openPanelThen(null); };
document.getElementById('ppRandom').onclick = function () {
  openPanelThen(function () {
    chrome.storage.session.set({ pendingRandom: true });
    try { chrome.runtime.sendMessage({ type: 'random' }); } catch (e) { }
  });
};
document.getElementById('ppGo').onclick = function () {
  var q = document.getElementById('ppQ').value.trim();
  if (!q) return;
  openPanelThen(function () {
    chrome.storage.session.set({ pendingQuery: q });
    try { chrome.runtime.sendMessage({ type: 'query', q: q }); } catch (e) { }
  });
};
document.getElementById('ppQ').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('ppGo').click();
});
