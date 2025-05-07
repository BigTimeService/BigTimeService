chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startOpenLootFetch') {
        fetch(message.url, {
            credentials: 'include',
            mode: 'cors'
        })
        .then(async (response) => {
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                console.log('[Injected] Successfully parsed JSON');
                chrome.runtime.sendMessage({ 
                    action: 'openLootFetchComplete', 
                    success: true, 
                    data: json 
                });
            } catch (e) {
                console.error('[Injected] Response is not JSON');
                chrome.runtime.sendMessage({ 
                    action: 'openLootFetchComplete', 
                    success: false, 
                    error: 'Response is not JSON' 
                });
            }
        })
        .catch(error => {
            console.error('[Injected] Fetch failed:', error);
            chrome.runtime.sendMessage({ 
                action: 'openLootFetchComplete', 
                success: false, 
                error: error.message 
            });
        });
        return true; 
    }
});