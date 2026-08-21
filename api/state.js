const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'credits_state.json');

// Default initial state template per account (Standard 61.00 EUR balance)
function createInitialAccount(id) {
  return {
    id: id || 'APIFORGE-3152134',
    balance: 61.00,
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
      if (parsed.accounts) {
        // Ensure every existing account has at least 61.00 balance
        for (const k in parsed.accounts) {
          if (parsed.accounts[k].balance < 61.00) {
            parsed.accounts[k].balance = 61.00;
          }
        }
        return parsed;
      }
    }
  } catch (e) {}
  
  return {
    accounts: {
      'APIFORGE-3152134': createInitialAccount('APIFORGE-3152134'),
      'default_user': createInitialAccount('default_user')
    }
  };
}

function saveState(stateObj) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateObj, null, 2), 'utf8');
  } catch (e) {}
}

const globalStore = loadState();
saveState(globalStore);

function getAccount(accountId) {
  const safeId = (typeof accountId === 'string' && accountId.trim()) ? accountId.trim() : 'APIFORGE-3152134';
  if (!globalStore.accounts) {
    globalStore.accounts = {};
  }
  if (!globalStore.accounts[safeId]) {
    globalStore.accounts[safeId] = createInitialAccount(safeId);
    saveState(globalStore);
  }
  // Guarantee active balance if below 0
  if (globalStore.accounts[safeId].balance <= 0) {
    globalStore.accounts[safeId].balance = 61.00;
    saveState(globalStore);
  }
  return globalStore.accounts[safeId];
}

function recordApiCall(accountId, model, inputTokens, outputTokens, latencyMs, status = 'Success') {
  const account = getAccount(accountId);
  inputTokens = inputTokens || 20;
  outputTokens = outputTokens || 40;
  const totalTokens = inputTokens + outputTokens;

  // Realistic micro-credit cost ($0.001 per request so 61 EUR lasts 61,000+ queries)
  const actualCost = 0.001;

  // Deduct from account-specific balance
  account.balance = Math.max(0, parseFloat((account.balance - actualCost).toFixed(4)));
  account.spend = parseFloat((account.spend + actualCost).toFixed(4));
  account.usedThisMonth = parseFloat((account.usedThisMonth + actualCost).toFixed(4));
  account.totalRequests = (account.totalRequests || 0) + 1;
  account.totalTokens = (account.totalTokens || 0) + totalTokens;

  const latSec = (latencyMs / 1000).toFixed(2) + 's';
  const costFormatted = '$' + actualCost.toFixed(3);

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
    balance: parseFloat(account.balance.toFixed(2)),
    usedThisMonth: parseFloat(account.usedThisMonth.toFixed(2)),
    totalRequests: account.totalRequests || 0,
    totalTokens: account.totalTokens || 0,
    avgLatency: avgLat,
    recentRequests: reqs
  };
}

module.exports = {
  getAccount,
  recordApiCall,
  addCredits,
  setBalance,
  getOverview,
  loadState,
  saveState
};
