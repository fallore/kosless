// Background worker.

// Toolbar button opens the in-page settings dialog (settings.js) on the Kosmora tab.
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab && tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'kq-open-settings' }, () => void chrome.runtime.lastError);
  });
}

