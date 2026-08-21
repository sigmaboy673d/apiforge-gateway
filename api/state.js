const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'credits_state.json');

// Default initial state template per account
function createInitialAccount(id) {
  return {
    id: id || 'APIFORGE-3152134',
    balance: 1.00,
    usedThisMonth: 0.00,
    totalRequests: 0,
    totalTokens: 0,
    spend: 0.00,
    recentRequests: []
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.accounts) {
        // Migrate legacy single state to multi-tenant structure
        return {
          accounts: {
            'APIFORGE-3152134': {
              id: 'APIFORGE-3152134',
              balance: parsed.balance || 1.00,
              usedThisMonth: parsed.usedThisMonth || 0.00,
              totalRequests: parsed.totalRequests || 0,
              totalTokens: parsed.totalTokens || 0,
              spend: parsed.spend || 0.00,
              recentRequests: parsed.recentRequests || []
            }
          }
        };
      }
      return parsed;
    }
  } catch (e) {}
  return {
    accounts: {
      'APIFORGE-3152134': createInitialAccount('APIFORGE-3152134')
    }
  };
}

function saveState(stateObj) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateObj, null, 2), 'utf8');
  } catch (e) {}
}

const globalStore = loadState();

function getAccount(accountId) {
  const safeId = (typeof accountId === 'string' && accountId.trim()) ? accountId.trim() : 'APIFORGE-3152134';
  if (!globalStore.accounts) {
    globalStore.accounts = {};
  }
  if (!globalStore.accounts[safeId]) {
    globalStore.accounts[safeId] = createInitialAccount(safeId);
    saveState(globalStore);
  }
  return globalStore.accounts[safeId];
}

function recordApiCall(accountId, model, inputTokens, outputTokens, latencyMs, status = 'Success') {
  const account = getAccount(accountId);
  inputTokens = inputTokens || 20;
  outputTokens = outputTokens || 40;
  const totalTokens = inputTokens + outputTokens;

  let actualCost = 0.50;
  if (model && model.includes('opus-5')) {
    actualCost = 1.30;
  } else if (model && model.includes('opus-4')) {
    actualCost = 0.70;
  }

  // Deduct from account-specific balance
  account.balance = Math.max(0, parseFloat((account.balance - actualCost).toFixed(2)));
  account.spend = parseFloat((account.spend + actualCost).toFixed(2));
  account.usedThisMonth = parseFloat((account.usedThisMonth + actualCost).toFixed(2));
  account.totalRequests = (account.totalRequests || 0) + 1;
  account.totalTokens = (account.totalTokens || 0) + totalTokens;

  const latSec = (latencyMs / 1000).toFixed(2) + 's';
  const costFormatted = '$' + actualCost.toFixed(2);

  if (!account.recentRequests) account.recentRequests = [];
  account.recentRequests.unshift({
    id: 'req_' + Math.random().toString(36).slice(2, 10),
    time: 'Just now',
    model: model || 'gpt-5.6-sol',
    tokens: totalTokens.toLocaleString(),
    latency: latSec,
    cost: costFormatted,
    status: status
  });

  if (account.recentRequests.length > 50) {
    account.recentRequests.pop();
  }

  saveState(globalStore);

  return {
    accountId: account.id,
    deducted: actualCost,
    remainingBalance: account.balance,
    costFormatted
  };
}

function addCredits(accountId, amount) {
  const account = getAccount(accountId);
  account.balance = parseFloat((account.balance + amount).toFixed(2));
  saveState(globalStore);
  return account.balance;
}

function setBalance(accountId, amount) {
  const account = getAccount(accountId);
  account.balance = parseFloat(amount.toFixed(2));
  saveState(globalStore);
  return account.balance;
}

function getOverview(accountId) {
  const account = getAccount(accountId);
  const reqs = account.recentRequests || [];
  const avgLat = reqs.length > 0 
    ? (reqs.reduce((acc, r) => acc + (parseFloat(r.latency) || 1.1), 0) / reqs.length).toFixed(2) + 's'
    : '0.00s';

  return {
    accountId: account.id,
    balance: account.balance,
    formattedBalance: '$' + account.balance.toFixed(2),
    usedThisMonth: '$' + (account.usedThisMonth || 0).toFixed(2),
    totalRequests: (account.totalRequests || 0).toLocaleString(),
    totalTokens: (account.totalTokens || 0) >= 1000000 
      ? ((account.totalTokens || 0) / 1000000).toFixed(2) + 'M' 
      : (account.totalTokens || 0).toLocaleString(),
    spend: '$' + (account.spend || 0).toFixed(2),
    avgLatency: avgLat,
    recentRequests: reqs
  };
}

module.exports = {
  globalStore,
  getAccount,
  recordApiCall,
  addCredits,
  setBalance,
  getOverview
};
