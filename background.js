// background.js — service worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'fixMyWriting',        title: 'Fix this writing',      contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translateToGerman',   title: 'Translate to German',   contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translateToEnglish',  title: 'Translate to English',  contexts: ['selection'] });
});

const MENU_ACTIONS = {
  fixMyWriting:       'fixText',
  translateToGerman:  'translateToGerman',
  translateToEnglish: 'translateToEnglish',
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = MENU_ACTIONS[info.menuItemId];
  if (!action || !info.selectionText) return;
  if (!tab?.id || tab.id < 0) return;

  const msg = { action, text: info.selectionText };

  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    // Content script not present — tab was open before the extension was
    // installed or last reloaded. Inject now and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      // Truly inaccessible page (chrome://, PDF viewer, etc.) — nothing we can do.
    }
  }
});
