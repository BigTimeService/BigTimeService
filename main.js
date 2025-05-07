import {
    fetchUserData,
    fetchSpaceData,
    processTimeWardenData,
    processHourglassData,
    processSpaceDataForBuy,
    processSpaceDataForRent,
    generateItemCards
} from './index.js';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'addLog') {
      if (typeof addLog === 'function') {
        addLog(message.message, {
          module: message.module || 'SYSTEM',
          isError: message.isError || false
        });
      }
    }
  });
function sendFetchRequestThroughBackground(url, shouldCloseTab = false) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: 'fetchViaOpenLootPage', 
          url,
          shouldCloseTab 
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Unknown fetch error'));
          }
        }
      );
    });
  }
  async function sendBatchFetchRequests(urls) {
    const results = [];

    for (let idx = 0; idx < urls.length; idx++) {
        const url = urls[idx];
        const pageNo = (url.match(/page=(\d+)/) || [,'?'])[1];
        const isLast = (idx === urls.length - 1);
        addLog(`正在读取第 ${pageNo} 页（${idx + 1}/${urls.length}）...`, { module: 'SYSTEM' });

        let attempt = 0;
        let success = false;
        let data = null;

        while (attempt < 3 && !success) {
            try {
                data = await sendFetchRequestThroughBackground(url, isLast);
                results.push(data);
                success = true;
            } catch (error) {
                attempt++;
                if (attempt < 3) {
                    const retryDelay = Math.random() * 4000 + 1000;
                    addLog(`第 ${attempt} 次重试 ${pageNo} 页将在 ${(retryDelay / 1000).toFixed(1)} 秒后`, { isError: true });
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                } else {
                    addLog(`第 ${pageNo} 页请求失败，已放弃重试`, { isError: true });
                    if (isLast) {
                        try {
                            await sendFetchRequestThroughBackground(url, true);
                        } catch (_) {
                        }
                    }
                }
            }
        }

        const normalDelay = Math.random() * 1000 + 1000;
        await new Promise(resolve => setTimeout(resolve, normalDelay));
    }

    return results;
}

document.addEventListener('DOMContentLoaded', function () {
    addLog('开始加载数据...');
    const announcementModalElement = document.getElementById('announcementModal');
    const announcementModal = new bootstrap.Modal(announcementModalElement);
    announcementModal.show();
    
    let countdown = 10;
    const countdownTimerElement = document.getElementById('countdownTimer');
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownTimerElement) {
            countdownTimerElement.textContent = `${countdown} 秒后自动关闭`;
        }
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            announcementModal.hide();
        }
    }, 1000);
    fetchUserData()
        .then(accountInfo => {
            updateUserUI(accountInfo);
            addLog('用户数据显示完成');
            fetchSpaceData()
                .then(spaceSchedule => {
                    updateSpaceTable(spaceSchedule);
                    addLog('SPACE数据显示完成');
                })
                .catch(e => console.error('SPACE数据加载失败:', e));
        })
        .catch(error => {
            addLog(`主流程失败: ${error.message}`, { isError: true });
        });

    document.getElementById('tradeTypeFilter').addEventListener('change', function () {
        const itemTypeFilter = document.getElementById('itemTypeFilter');
        const qualityFilter = document.getElementById('qualityFilter');

        itemTypeFilter.hidden = false;
        itemTypeFilter.value = ''; 
        qualityFilter.hidden = true;
        qualityFilter.innerHTML = '<option value="">物品品质</option>'; 
    });

    document.getElementById('itemTypeFilter').addEventListener('change', function () {
        const qualityFilter = document.getElementById('qualityFilter');
        qualityFilter.innerHTML = '<option value="">物品品质</option>';

        if (this.value === 'hourglass') {
            const colors = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Exalted'];
            colors.forEach(color => {
                const option = document.createElement('option');
                option.textContent = color;
                qualityFilter.appendChild(option);
            });
            qualityFilter.hidden = false; 
        } else if (this.value === 'warden') {
            const qualities = ['Solar', 'Meteoric', 'Stellar', 'Astral', 'Celestial'];
            qualities.forEach(quality => {
                const option = document.createElement('option');
                option.textContent = quality;
                qualityFilter.appendChild(option);
            });
            qualityFilter.hidden = false;
        } else if (this.value === 'space') {
            qualityFilter.hidden = true;
        } else {
            qualityFilter.hidden = true;
        }
    });
    document.getElementById('retryLoginBtn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'verifyUserLoginExplicit' }, (response) => {
          if (response?.success) {
            addLog(`登录成功：${response.username}，正在加载数据`, { module: 'USER' });
            location.reload();
          } else {
            addLog(`登录未完成或超时，请重试`, { isError: true });
          }
        });
      });
    document.getElementById('searchButton').addEventListener('click', async function () {
        const tradeType = document.getElementById('tradeTypeFilter').value;
        const itemType = document.getElementById('itemTypeFilter').value;
        const quality = document.getElementById('qualityFilter').value;
        const queryResultContainer = document.getElementById('queryResultContainer');
        if (!itemType) {
            showModalAlert('物品类型是必选项');
            return;
        }
        if ((itemType === 'warden' || itemType === 'hourglass') && !quality) {
            showModalAlert('物品品质是必选项');
            return;
        }
        try {
            let url, processedItems, resultText;
            if (itemType === 'warden') {
                    addLog(`正在查询 ${quality} Time Warden ${tradeType === 'rent' ? '租赁' : '购买'}数据`, { module: 'GUARD' });
                    if (tradeType === 'rent') {
                        url = `https://listing-api.openloot.com/v2/market/rentals?page=1&q=${encodeURIComponent(quality + ' Time Warden')}&rentalPeriods=2592000&sort=price%3Aasc`;
                        const firstResult = await sendFetchRequestThroughBackground(url, false);
                        const totalPages = firstResult?.totalPages || 1;
                        addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                        let selectedPageCount = totalPages;
                        if (totalPages > 1) {
                            const userSelection = await showPageSelectionModal(totalPages);
                            selectedPageCount = userSelection === null ? 1 : userSelection;
                        }
                        const pageUrls = [];
                        for (let page = 1; page <= selectedPageCount; page++) {
                            pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                        }
                        const allResults = await sendBatchFetchRequests(pageUrls);
                        const allItems = allResults.flatMap(result => result?.items || []);
                        processedItems = processTimeWardenData(quality, { items: allItems }, 'rent');
                        resultText = generateItemCards(processedItems);
            } else {
                const qualityMap = {
                    'Solar': 'Uncommon',
                    'Meteoric': 'Rare',
                    'Stellar': 'Epic',
                    'Astral': 'Legendary',
                    'Celestial': 'Mythic'
                };
                const rarity = qualityMap[quality];
                url = `https://listing-api.openloot.com/v2/market/listings/BT0_Time_Warden_${rarity}/items?onSale=true&page=1&pageSize=48&sort=price%3Aasc`;
                const firstResult = await sendFetchRequestThroughBackground(url, false);
                const totalPages = firstResult?.totalPages || 1;
                addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                let selectedPageCount = totalPages;
                if (totalPages > 1) {
                    const userSelection = await showPageSelectionModal(totalPages);
                    selectedPageCount = userSelection === null ? 1 : userSelection;
                }
                const pageUrls = [];
                for (let page = 1; page <= selectedPageCount; page++) {
                    pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                }
                const allResults = await sendBatchFetchRequests(pageUrls);
                const allItems = allResults.flatMap(result => result?.items || []);
                processedItems = processTimeWardenData(quality, { items: allItems }, 'buy');
                resultText = generateItemCards(processedItems);
            }
            } else if (itemType === 'hourglass') {
                addLog(`正在查询 Hourglass ${tradeType === 'rent' ? '租赁' : '购买'}数据`, { module: 'HOURGLASS' });
                if (tradeType === 'rent') {
                    url = `https://listing-api.openloot.com/v2/market/rentals?page=1&q=Hourglass&rarity=${quality}&rentalPeriods=2592000&sort=price%3Aasc`;
                    const firstResult = await sendFetchRequestThroughBackground(url, false);
                    const totalPages = firstResult?.totalPages || 1;
                    addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                    let selectedPageCount = totalPages;
                    if (totalPages > 1) {
                        const userSelection = await showPageSelectionModal(totalPages);
                        selectedPageCount = userSelection === null ? 1 : userSelection;
                    }
                    const pageUrls = [];
                    for (let page = 1; page <= selectedPageCount; page++) {
                        pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                    }
                    const allResults = await sendBatchFetchRequests(pageUrls);
                    const allItems = allResults.flatMap(result => result?.items || []);
                    processedItems = processHourglassData(quality, { items: allItems }, 'rent');
                    resultText = generateItemCards(processedItems); 
                } else {
                    url = `https://listing-api.openloot.com/v2/market/listings/BT0_Hourglass_${quality}/items?onSale=true&page=1&pageSize=48&sort=price%3Aasc`;
                    const firstResult = await sendFetchRequestThroughBackground(url, false);
                    const totalPages = firstResult?.totalPages || 1;
                    addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                    let selectedPageCount = totalPages;
                    if (totalPages > 1) {
                        const userSelection = await showPageSelectionModal(totalPages);
                        selectedPageCount = userSelection === null ? 1 : userSelection;
                    }
                    const pageUrls = [];
                    for (let page = 1; page <= selectedPageCount; page++) {
                        pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                    }
                    const allResults = await sendBatchFetchRequests(pageUrls);
                    const allItems = allResults.flatMap(result => result?.items || []);
                    processedItems = processHourglassData(quality, { items: allItems }, 'buy');
                    resultText = generateItemCards(processedItems);
                }
            } else if (itemType === 'space') {
                addLog(`正在查询空间 ${tradeType === 'rent' ? '租赁' : '购买'}数据`, { module: 'SPACE' });
    
                if (tradeType === 'rent') {
                    url = `https://listing-api.openloot.com/v2/market/rentals?page=1&q=space&rentalListingType=BUNDLE&rentalPeriods=2592000&sort=price%3Adesc`;
                    const firstResult = await sendFetchRequestThroughBackground(url, false);
                    const totalPages = firstResult?.totalPages || 1;
                    addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                    //addLog(` ${JSON.stringify(firstResult)} `, { module: 'SYSTEM' });
                    let selectedPageCount = totalPages;
                    if (totalPages > 1) {
                        const userSelection = await showPageSelectionModal(totalPages);
                        if (userSelection === null) {
                            selectedPageCount = 1;
                        } else {
                            selectedPageCount = userSelection;
                        }
                    }
                    const pageUrls = [];
                    for (let page = 1; page <= selectedPageCount; page++) {
                        pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                    }
                    const allResults = await sendBatchFetchRequests(pageUrls);
                    const allItems = allResults.flatMap(result => result?.items || []);
                    processedItems = processSpaceDataForRent({ items: allItems });
                    resultText = generateItemCards(processedItems);
                } else {
                    url = `https://listing-api.openloot.com/v2/market/listings?gameId=56a149cf-f146-487a-8a1c-58dc9ff3a15c&onSale=true&page=1&sort=price%3Aasc&tags=space`;
                    const firstResult = await sendFetchRequestThroughBackground(url, false);
                    const totalPages = firstResult?.totalPages || 1;
                    addLog(`检测到有 ${totalPages} 页数据`, { module: 'SYSTEM' });
                    let selectedPageCount = totalPages;
                    if (totalPages > 1) {
                        const userSelection = await showPageSelectionModal(totalPages);
                        selectedPageCount = userSelection === null ? 1 : userSelection;
                    }
                    const pageUrls = [];
                    for (let page = 1; page <= selectedPageCount; page++) {
                        pageUrls.push(url.replace(/page=\d+/, `page=${page}`));
                    }
                    const allResults = await sendBatchFetchRequests(pageUrls);
                    const allItems = allResults.flatMap(result => result?.items || []);
                    processedItems = processSpaceDataForBuy({ items: allItems });
                    resultText = generateItemCards(processedItems); 
                }
            } else {
                queryResultContainer.innerHTML = '请选择有效的查询条件';
                return;
            }
            queryResultContainer.innerHTML = resultText;
    
        } catch (error) {
            addLog(`查询失败: ${error.message}`, { isError: true });
            queryResultContainer.innerHTML = '<p class="text-danger">查询失败，请稍后重试</p>';
        }
    });

    document.getElementById('resetButton').addEventListener('click', function () {
        const tradeTypeFilter = document.getElementById('tradeTypeFilter');
        const itemTypeFilter = document.getElementById('itemTypeFilter');
        const qualityFilter = document.getElementById('qualityFilter');
        const queryResultContainer = document.getElementById('queryResultContainer');

        tradeTypeFilter.value = '';
        itemTypeFilter.value = '';
        itemTypeFilter.hidden = true;
        qualityFilter.value = '';
        qualityFilter.hidden = true;
        qualityFilter.innerHTML = '<option value="">物品品质</option>';
        queryResultContainer.innerHTML = '<p class="text-muted">请选择条件后点击查询</p>';
    });
});

function updateUserUI(accountInfo) {
    document.getElementById('username').textContent = accountInfo.username;
    document.getElementById('balance').textContent = accountInfo.usdcBalance.toFixed(2);
    document.getElementById('olBalance').textContent = accountInfo.olBalance.toFixed(2);
    document.getElementById('bigtimeTotal').textContent = accountInfo.bigtimeTotal.toFixed(2);
    document.getElementById('bigtimeWithdrawable').textContent = accountInfo.bigtimeWithdrawable.toFixed(2);
    document.getElementById('updateTime').textContent = moment(accountInfo.updateTime).format('YYYY-MM-DD HH:mm');
}
function updateSpaceTable(spaceSchedule) {
    const tableBody = document.getElementById('spaceTableBody');
    tableBody.innerHTML = ''; 

    const cards = Object.entries(spaceSchedule)
        .sort(([timeA], [timeB]) => new Date(timeA) - new Date(timeB))
        .map(([minuteKey, types]) => {
            const typeCounts = Object.entries(types).map(([type, count]) => `${type} *${count}`).join('，');
            const isExpired = new Date(minuteKey) < new Date();

            return `
                <div class="toolbox-card ${isExpired ? 'expired' : ''}">
                    <div class="card-header">
                        <span class="card-title">掉落时间: ${minuteKey}${isExpired ? ' <span class="badge-ready">READY</span>' : ''}</span>
                    </div>
                    <div class="card-body">
                        <p><strong>SPACE列表：</strong>${typeCounts}</p>
                    </div>
                </div>
            `;
        }).join('');

    tableBody.outerHTML = `<div class="toolbox-grid" id="spaceTableBody">${cards}</div>`;
}
function showModalAlert(message) {
    const modalHtml = `
        <div class="modal fade" id="alertModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">提示</h5>
                    </div>
                    <div class="modal-body">
                        ${message}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">确认</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const oldModal = document.getElementById('alertModal');
    if (oldModal) {
        oldModal.remove();
    }
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
    alertModal.show();
}
function showPageSelectionModal(totalPages) {
    return new Promise((resolve) => {
        const modalHtml = `
        <div class="modal fade" id="pageSelectModal" tabindex="-1" aria-labelledby="pageSelectModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content p-4">
                    <div class="modal-header">
                        <h5 class="modal-title" id="pageSelectModalLabel">多页数据选择</h5>
                    </div>
                    <div class="modal-body">
                        <p>共查询到 <b>${totalPages}</b> 页数据，请输入想抓取的页数：</p>
                        <input type="number" id="pageCountInput" class="form-control" min="1" max="${totalPages}" placeholder="最多 ${totalPages} 页">
                    </div>
                    <div class="modal-footer">
                        <button id="confirmPageBtn" type="button" class="btn btn-primary">确认</button>
                    </div>
                </div>
            </div>
        </div>`;

        const oldModal = document.getElementById('pageSelectModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const pageSelectModalEl = document.getElementById('pageSelectModal');
        const pageSelectModal = new bootstrap.Modal(pageSelectModalEl);
        pageSelectModal.show();

        document.getElementById('confirmPageBtn').addEventListener('click', () => {
            const pageCount = parseInt(document.getElementById('pageCountInput').value);
            if (pageCount >= 1 && pageCount <= totalPages) {
                pageSelectModal.hide();
                resolve(pageCount);
            } else {
                alert(`请输入 1 到 ${totalPages} 之间的数字`);
            }
        });

        pageSelectModalEl.addEventListener('hidden.bs.modal', () => {
            resolve(null);
        });
    });
}
