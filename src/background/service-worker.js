const tabData = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'ANALYSIS_UPDATE' && sender.tab) {
    tabData.set(sender.tab.id, message.data);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  tabData.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TokenLens] Installed');
});
