const TIME_WARDEN_QUALITIES = ['Solar', 'Meteoric', 'Stellar', 'Astral', 'Celestial'];

function calculateUpgradeableLevel(currentLevel, currentExp) {
    const levelRequirements = [
        1000,   
        3000,   
        5000,   
        8000,   
        11000,  
        15000,  
        19000,  
        24000,  
        29000,  
        35000,  
        41000,  
        48000,  
        55000,  
        63000,  
        71000,  
        80000,  
        89000,  
        99000,  
        109000, 
        120000, 
        131000, 
        143000, 
        155000, 
        168000, 
        181000, 
        195000, 
        209000, 
        224000, 
        239000  
    ];

    let level = currentLevel;
    let remainingExp = currentExp;                
    for (let i = currentLevel; i < levelRequirements.length; i++) {
        const cost = levelRequirements[i];          
        if (remainingExp >= cost) {
            remainingExp -= cost;                  
            level = i + 1;                         
        } else {
            break;                                 
        }
    } 
    return level;
}
function generateItemCards(items) {
    if (!items || items.length === 0) {
        return '<p class="text-muted">未找到匹配的物品</p>';
    }
    const cards = items.map(item => {
        let subItemsHtml = '';
        if (item.items && item.items.length > 0) {
            subItemsHtml = `
                <div class="sub-items">
                    <h4>${item.type === 'warden' ? '守卫列表' : '沙漏列表'}</h4>
                    <ul>
                        ${item.items.map(subItem => `
                            <li>编号: ${subItem.id}, ${item.type === 'warden' ? `等级: ${subItem.level}, 经验: ${subItem.exp}` : `剩余时间: ${subItem.timeRemaining}`}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
        const titlePrefix = '';
        const labels = item.fields?.map(f => f.label) || [];
        const values = item.fields?.map(f => f.value) || [];
        let infoHtml = '';
        if (item.type === 'hourglass') {
            infoHtml = labels.map((label, idx) => `
                <div class="info-row">
                    <span class="info-label">${label}</span>
                    <span class="info-value">${values[idx]}</span>
                </div>
            `).join('');
        } else {
            infoHtml = `
                <div class="info-labels">
                    ${labels.map(label => `<span class="info-label">${label}</span>`).join('')}
                </div>
                <div class="info-values">
                    ${values.map((value, idx) => {
                        if (labels[idx] === '经验' && item.type === 'warden') {
                            const currentLevel = Number(item.fields.find(f => f.label === '等级')?.value || 1);
                            const expValue = Number(value);
                            const realLevel = calculateUpgradeableLevel(currentLevel, expValue);
                            return `<span class="info-value">${value} <span class="exp-tag">⬆️${realLevel}</span></span>`;
                        } else {
                            return `<span class="info-value">${value}</span>`;
                        }
                    }).join('')}
                </div>
            `;
        }
        return `
            <div class="toolbox-card">
                <div class="card-header">
                    <span class="card-title">${titlePrefix}: ${item.title}</span>
                </div>
                <div class="card-body">
                    <div class="info-group">
                        ${infoHtml}
                        ${subItemsHtml && subItemsHtml.trim() ? subItemsHtml : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    return `<div class="toolbox-grid">${cards}</div>`;
}

function processUserData(userData) {
    if (!userData.username || !userData.userTokens) {
        throw new Error('用户信息不完整，缺少 username 或 userTokens');
    }

    const accountInfo = {
        username: userData.username,
        usdcBalance: userData.balance,
        olBalance: userData.userTokens.find(token => token.token.name === '$OL').balance,
        bigtimeTotal: userData.userTokens.find(token => token.token.name === '$BIGTIME').balance,
        bigtimeWithdrawable: (() => {
            const bigtimeToken = userData.userTokens.find(token => token.token.name === '$BIGTIME');
            return bigtimeToken.balance - bigtimeToken.pendingBalance;
        })(),
        updateTime: new Date().toISOString()
    };
    console.log('Processed account info:', accountInfo);
    return accountInfo;
}

function processSpaceData(assetsData) {
    if (!assetsData.items) throw new Error('NFT资产数据不完整');
    const spaceDropTimes = [];
    assetsData.items.forEach(asset => {
        if (asset.metadata.nftTags.includes('NFT.SPACE')) {
            const lastDropTimeAttr = asset.extra.attributes?.find(attr => attr.name === 'LastCrackedHourGlassDropTime');
            if (lastDropTimeAttr) {
                const lastDropTime = moment(lastDropTimeAttr.value);
                const tags = asset.metadata.tags;
                const rarity = tags[1];
                const size = tags[2];
                const interval = getDropInterval(rarity, size);
                if (interval) {
                    const dropTime = lastDropTime.clone().add(interval, 'hours');
                    spaceDropTimes.push({
                        id: asset.id,
                        dropTime: dropTime,
                        rarity: rarity,
                        size: size
                    });
                }
            }
        }
    });
    console.log('Processed space drop times:', spaceDropTimes);
    const spaceSchedule = groupByMinute(spaceDropTimes);
    console.log('Processed space schedule:', spaceSchedule);
    return spaceSchedule;
}

async function fetchUserData() {
    try {
        addLog('开始获取用户信息', { module: 'USER' });
        const response = await fetch('https://api.openloot.com/market/me', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return processUserData(data);
    } catch (error) {
        addLog(`用户数据获取失败: ${error.message}`, {
            module: 'USER',
            isError: true
        });
        throw error;
    }
}

function getDropInterval(rarity, size) {
    const intervals = {
        'rare': { 'small': 72, 'medium': 66, 'large': 60 },
        'epic': { 'small': 66, 'medium': 60, 'large': 54 },
        'legendary': { 'small': 60, 'medium': 54, 'large': 48 },
        'mythic': { 'small': 54, 'medium': 48, 'large': 42 },
        'exalted': { 'small': 48, 'medium': 42, 'large': 36 }
    };
    return intervals[rarity]?.[size] || null;
}

function groupByMinute(spaceDropTimes) {
    const grouped = {};
    spaceDropTimes.forEach(space => {
        const minuteKey = space.dropTime.format('YYYY-MM-DD HH:mm');
        const typeKey = `${space.rarity} ${space.size}`;
        if (!grouped[minuteKey]) {
            grouped[minuteKey] = {};
        }
        if (!grouped[minuteKey][typeKey]) {
            grouped[minuteKey][typeKey] = 0;
        }
        grouped[minuteKey][typeKey]++;
    });
    return grouped;
}
async function fetchSpaceData() {
    try {
        addLog('开始获取SPACE数据', { module: ' SPACE' });
        const response = await fetch('https://vault-api.openloot.com/v2/market/items/in-game?page=1&pageSize=1000&sort=name%3Aasc', {
            credentials: 'include'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return processSpaceData(data);

    } catch (error) {
        addLog(`SPACE数据获取失败: ${error.message}`, {
            module: 'SPACE',
            isError: true
        });
        throw error;
    }
}
function processHourglassData(color, data, dataType = 'buy') {
    if (!data || !Array.isArray(data.items)) {
        addLog('返回数据格式错误，无法处理', { module: 'HOURGLASS', isError: true });
        return [];
    }
    const minPrice = Math.min(...(data.items.map(item => item.price)));
    if (dataType === 'buy') {
        return data.items.map(item => {
            const attributes = item.extra?.attributes || [];
            const timeRemaining = parseFloat(attributes.find(attr => attr.name === "TimeRemaining")?.value || "0");
            let timeCost = 'N/A';

            if (timeRemaining > 0) {
                timeCost = ((item.price - minPrice) / (timeRemaining / 60)).toFixed(2);
            }

            return {
                title: item.issuedId,
                type: 'hourglass',
                fields: [
                    { label: '价格', value: item.price },
                    { label: '剩余时间', value: timeRemaining },
                    { label: '每小时成本', value: timeCost }
                ]
            };
        }).sort((a, b) => a.fields[0].value - b.fields[0].value);
    } else if (dataType === 'rent') {
        return data.items.map(item => {
            const bundleName = item.name || '未知包名';
            const price = item.price;
            const hourglasses = (item.content || [])
                .filter(i => i.metadata?.tags?.includes('hourglass'))
                .map(i => {
                    const attrs = i.extra?.attributes || [];
                    const timeRemain = parseFloat(attrs.find(attr => attr.name === "TimeRemaining")?.value || "0");
                    return `${i.metadata?.name || 'Hourglass'}：${timeRemain}分钟`;
                });
    
            return {
                title: `租赁包：${bundleName}`,
                type: 'hourglass',
                fields: [
                    { label: '租金', value: price },
                    ...hourglasses.map(t => {
                        const [name, time] = t.split('：');
                        return { label: name, value: time };
                    })
                ]
            };
        }).sort((a, b) => a.fields[0].value - b.fields[0].value);
    }
}
function processSpaceDataForBuy(data) {
    if (!data.items || data.items.length === 0) {
      addLog(`未找到空间物品`, { module: 'SPACE' });
      return [];
    }
  
    const processedItems = data.items
        .filter(item => item.name.includes('SPACE'))
        .map(item => ({
          title: item.name,
          type: 'space',
          fields: [
            { label: '最低价格', value: item.minPrice || 'N/A' }
          ]
        }))
        .sort((a, b) => a.fields[0].value - b.fields[0].value);
  
    if (processedItems.length === 0) {
      addLog(`空间物品不匹配`, { module: 'SPACE' });
      return [];
    }
  
    addLog(`成功获取空间购买数据`, { module: 'SPACE' });
    return processedItems;
}
function processSpaceDataForRent(data) {
    if (!data.items || data.items.length === 0) {
      addLog(`未找到空间租赁物品`, { module: 'SPACE' });
      return [];
    }
  
    const processedItems = data.items
      .map(item => {
        let spaceCount = 0;
        if (Array.isArray(item.content)) {
          spaceCount = item.content.filter(subItem =>
            subItem.metadata?.nftTags?.includes('NFT.SPACE')
          ).length;
        }
        if (spaceCount === 0) return null; 
        const singlePrice = item.price / spaceCount;
        return {
          title: item.name,
          type: 'space',
          fields: [
            { label: '租金', value: item.price },
            { label: '数量', value: spaceCount },
            { label: '单空间租金', value: singlePrice.toFixed(2) }
          ],
          sortKey: singlePrice 
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.sortKey - b.sortKey) 
      .map(({ sortKey, ...rest }) => rest); 
  
    if (processedItems.length === 0) {
      addLog(`空间租赁物品不匹配`, { module: 'SPACE' });
      return [];
    }
    addLog(`成功获取空间租赁数据`, { module: 'SPACE' });
    return processedItems;
  }
function processTimeWardenData(quality, data, dataType = 'buy') {
    if (!data.items || data.items.length === 0) {
        addLog(`未找到${quality} Time Warden${dataType === 'buy' ? '购买' : '租赁'}物品`, { module: 'GUARD' });
        return [];
    }
    let processedItems = [];
    if (dataType === 'buy') {
        processedItems = data.items.map(item => {
            const attributes = item.extra?.attributes || [];
            const level = attributes.find(attr => attr.name === 'ItemLevel')?.value || '0';
            const exp = attributes.find(attr => attr.name === 'ItemExperience')?.value || 'N/A';
            return {
                title: item.issuedId,
                type: 'warden',
                price: item.price,
                fields: [
                    { label: '价格', value: item.price },
                    { label: '等级', value: level },
                    { label: '经验', value: exp }
                ]
            };
        }).sort((a, b) => a.price - b.price);
    } else if (dataType === 'rent') {
        processedItems = data.items.map(bundle => {
            const matchingItems = (bundle.content || []).filter(contentItem => {
                return (contentItem.metadata?.tags || []).includes('timewarden');
            }).map(contentItem => {
                const attributes = contentItem.extra?.attributes || [];
                const level = attributes.find(attr => attr.name === 'ItemLevel')?.value || '0';
                const exp = attributes.find(attr => attr.name === 'ItemExperience')?.value || 'N/A';
                return { id: contentItem.issuedId, level, exp };
            });
            if (matchingItems.length === 0) return null;
            return {
                title: bundle.name,
                type: 'warden',
                price: bundle.price,
                itemCount: matchingItems.length,
                items: matchingItems
            };
        }).filter(Boolean).sort((a, b) => a.price - b.price);
    }
    return processedItems;
}
export {
    fetchUserData,
    fetchSpaceData,
    processTimeWardenData,
    processHourglassData,
    processSpaceDataForBuy,
    processSpaceDataForRent,
    generateItemCards
};