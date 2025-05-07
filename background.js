'use strict';
let OPENLOOT_TAB_ID = null;
let pendingRequests = 0;
let closeAfterThis = false;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchViaOpenLootPage') {
    fetchViaOpenLootPage(message.url, message.shouldCloseTab)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }
  if (message.action === 'verifyUserLoginExplicit') {
    (async () => {
      const tab = await new Promise(resolve => {
        chrome.tabs.create({ url: 'https://openloot.com', active: true }, resolve);
      });
      const tabId = tab.id;
      let maxAttempts = 20;
      let responseSent = false;
      const interval = setInterval(async () => {
        try {
          chrome.runtime.sendMessage({ action: 'addLog', message: '正在检查登录状态...', module: 'USER' });
          const res = await fetch('https://api.openloot.com/market/me', { credentials: 'include' });
          if (!res.ok) throw new Error();
          const data = await res.json();

          if (data?.username && !responseSent) {
            responseSent = true;
            clearInterval(interval);
            chrome.tabs.remove(tabId);
            chrome.runtime.sendMessage({ action: 'addLog', message: `登录成功，用户：${data.username}，正在加载数据`, module: 'USER' });
            sendResponse({ success: true, username: data.username });
          }
        } catch (err) {
          if (--maxAttempts <= 0 && !responseSent) {
            responseSent = true;
            clearInterval(interval);
            chrome.runtime.sendMessage({ action: 'addLog', message: '登录超时，未检测到用户信息', module: 'USER', isError: true });
            sendResponse({ success: false, error: '登录超时' });
          }
        }
      }, 3000);
    })();
    return true;
  }
  if (message.action === 'addLog') {
    addLog(message.message, {
      module: message.module || 'SYSTEM',
      isError: message.isError || false
    });
  }
});

function fetchInExistingTab(tabId, targetUrl, resolve, reject) {
  function responseListener(message, sender) {
    if (sender.tab && sender.tab.id === tabId && message.action === 'openLootFetchComplete') {
      pendingRequests--;
      
      if (closeAfterThis && pendingRequests === 0 && OPENLOOT_TAB_ID) {
        chrome.tabs.remove(OPENLOOT_TAB_ID);
        OPENLOOT_TAB_ID = null;
      } 
      
      chrome.runtime.onMessage.removeListener(responseListener);
      
      if (message.success) {
        resolve(message.data);
      } else {
        reject(new Error(message.error));
      }
    }
  }

  chrome.runtime.onMessage.addListener(responseListener);

  chrome.tabs.get(tabId, (tab) => {
    if (tab.status === 'complete') {
      sendFetchRequest(tabId, targetUrl);
    } else {
      chrome.tabs.onUpdated.addListener(function waitForTabLoad(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === 'complete') {
          sendFetchRequest(tabId, targetUrl);
          chrome.tabs.onUpdated.removeListener(waitForTabLoad);
        }
      });
    }
  });

  function sendFetchRequest(tabId, url) {
    chrome.tabs.sendMessage(tabId, { 
      action: 'startOpenLootFetch', 
      url: url 
    });
  }
}

function fetchViaOpenLootPage(targetUrl, shouldCloseTab = false) {
  return new Promise((resolve, reject) => {
    closeAfterThis = shouldCloseTab;
    
    if (OPENLOOT_TAB_ID) {
      chrome.tabs.get(OPENLOOT_TAB_ID, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          pendingRequests++;
          fetchInExistingTab(OPENLOOT_TAB_ID, targetUrl, resolve, reject);
          return;
        }
        OPENLOOT_TAB_ID = null;
        createNewTab();
      });
    } else {
      createNewTab();
    }

    function createNewTab() {
      chrome.tabs.create({ 
        url: 'https://openloot.com', 
        active: false 
      }, (tab) => {
        OPENLOOT_TAB_ID = tab.id;
        pendingRequests = 1;
        fetchInExistingTab(tab.id, targetUrl, resolve, reject);
      });
    }
  });
}