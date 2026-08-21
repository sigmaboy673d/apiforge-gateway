const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, '..', 'keys_state.json');

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveKeys(store) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {}
}

const keyStore = loadKeys();

function getOrCreateKey(accountId) {
  const safeId = (typeof accountId === 'string' && accountId.trim()) ? accountId.trim() : 'default_user';
  if (!keyStore[safeId]) {
    keyStore[safeId] = {
      accountId: safeId,
      apiKey: 'forge_live_' + crypto.randomBytes(24).toString('hex'),
      createdAt: new Date().toISOString(),
      status: 'active',
      tier: 'unlimited-speed',
      model: 'gpt-5.6-sol'
    };
    saveKeys(keyStore);
  }
  return keyStore[safeId];
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const accountId = req.headers['x-user-id'] || req.body?.accountId || 'default_user';

  if (req.method === 'POST') {
    const entry = getOrCreateKey(accountId);
    return res.status(200).json({
      success: true,
      accountId: entry.accountId,
      apiKey: entry.apiKey,
      status: entry.status,
      model: entry.model,
      tier: entry.tier,
      createdAt: entry.createdAt,
      endpoints: {
        openai: '/v1/chat/completions',
        anthropic: '/v1/messages',
        models: '/v1/models'
      }
    });
  }

  // GET: return key for account (or regenerate if requested)
  const regenerate = req.url.includes('regenerate=true');
  if (regenerate && keyStore[accountId]) {
    delete keyStore[accountId];
  }
  const entry = getOrCreateKey(accountId);
  res.status(200).json({
    status: 'online',
    accountId: entry.accountId,
    apiKey: entry.apiKey,
    model: entry.model,
    tier: entry.tier,
    activeKeysCount: Object.keys(keyStore).length
  });
};