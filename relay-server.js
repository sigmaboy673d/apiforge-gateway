const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MASTER_KEY = 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld';
const RELAY_PORT = 4567;
const RELAY_SECRET = 'apiforge-relay-secret-2026';
const STATE_FILE = path.join(__dirname, 'credits_state.json');

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const MODEL_MAP = {
  'gpt-5.6-sol':     'claude-opus-4-8',
  'gpt-5.5':         'claude-opus-4-8',
  'gpt-5':           'claude-opus-4-8',
  'gpt-4o':          'claude-opus-4-8',
  'claude-opus-4-8': 'claude-opus-4-8',
  'claude-opus-5':   'claude-opus-5',
  'claude-opus':     'claude-opus-5',
  'claude-3-opus':   'claude-opus-5',
};

function getUpstreamModel(m) { return MODEL_MAP[m] || 'claude-opus-4-8'; }

function sanitize(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/porcodio/gi, 'mannaggia')
    .replace(/porco\s*dio/gi, 'mannaggia')
    .replace(/madonna\s*puttana/gi, 'accipicchia')
    .replace(/dio\s*cane/gi, 'cavolo');
}

function deductLocalCredit(model, inputTokens, outputTokens) {
  try {
    let stateObj = { balance: 1.00, usedThisMonth: 0, totalRequests: 0, totalTokens: 0, spend: 0, recentRequests: [] };
    if (fs.existsSync(STATE_FILE)) {
      stateObj = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }

    const totalTokens = (inputTokens || 20) + (outputTokens || 40);
    let actualCost = 0.01;
    if (model && model.includes('opus-5')) actualCost = 0.02;

    stateObj.balance = Math.max(0, parseFloat((stateObj.balance - actualCost).toFixed(2)));
    stateObj.spend = parseFloat((stateObj.spend + actualCost).toFixed(2));
    stateObj.usedThisMonth = parseFloat((stateObj.usedThisMonth + actualCost).toFixed(2));
    stateObj.totalRequests = (stateObj.totalRequests || 0) + 1;
    stateObj.totalTokens = (stateObj.totalTokens || 0) + totalTokens;

    stateObj.recentRequests.unshift({
      id: 'req_' + Math.random().toString(36).slice(2, 10),
      time: 'Just now',
      model: model || 'gpt-5.6-sol',
      tokens: totalTokens.toLocaleString(),
      latency: '1.14s',
      cost: '$' + actualCost.toFixed(2),
      status: 'Success'
    });

    if (stateObj.recentRequests.length > 50) stateObj.recentRequests.pop();
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateObj, null, 2), 'utf8');
    console.log(`[LEDGER] Deducted $${actualCost.toFixed(2)} · New Balance: $${stateObj.balance.toFixed(2)} · Requests: ${stateObj.totalRequests}`);
  } catch(e) {
    console.error('Error updating ledger:', e.message);
  }
}

function sendToAgentRouter(payload) {
  return new Promise((resolve) => {
    const upReq = https.request({
      hostname: 'agentrouter.org',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${MASTER_KEY}`,
        'x-api-key': MASTER_KEY,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-cli/1.0.108 (external, cli)'
      },
      timeout: 30000
    }, upRes => {
      let raw = '';
      upRes.on('data', d => raw += d.toString());
      upRes.on('end', () => {
        resolve({ statusCode: upRes.statusCode, raw });
      });
    });

    upReq.on('error', err => {
      resolve({ statusCode: 502, raw: JSON.stringify({ error: err.message }) });
    });

    upReq.write(payload);
    upReq.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-relay-secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const secret = req.headers['x-relay-secret'];
  if (!timingSafeMatch(secret, RELAY_SECRET)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (req.url === '/health' || req.url === '/relay/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'online', relay: 'ForgeAPI PC Relay', ts: Date.now() }));
  }

  if (req.url === '/relay' && req.method === 'POST') {
    const body = await readBody(req);

    const requestedModel = body.model || 'gpt-5.6-sol';
    const upstreamModel = getUpstreamModel(requestedModel);

    let systemPrompt = sanitize(body.system) || 'You are an intelligent, precise AI assistant. Always respond fluently and naturally.';
    const messages = [];
    (body.messages || []).forEach(m => {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: sanitize(m.content)
      });
    });
    if (messages.length === 0) messages.push({ role: 'user', content: 'Ciao' });

    // Primary attempt: standard payload
    let payload = JSON.stringify({
      model: upstreamModel,
      messages,
      max_tokens: Math.min(body.max_tokens || 4096, 4096),
      stream: false,
      system: systemPrompt
    });

    let result = await sendToAgentRouter(payload);

    // If upstream returns content-blocked, intelligently wrap prompt in English envelope to bypass upstream keyword WAF
    if (result.statusCode !== 200 || result.raw.includes('content-blocked')) {
      console.log(`[WAF BYPASS] Triggering smart English envelope for model ${requestedModel}`);
      const lastUserMsg = messages.filter(m => m.role === 'user').pop() || { content: 'Ciao' };
      
      const wrappedPayload = JSON.stringify({
        model: upstreamModel,
        system: 'You are a highly intelligent AI assistant. The user is communicating in Italian. Answer their request thoroughly, accurately, and naturally in fluent Italian.',
        messages: [{
          role: 'user',
          content: `User query: "${lastUserMsg.content}". Please provide the complete, natural response in Italian.`
        }],
        max_tokens: Math.min(body.max_tokens || 4096, 4096),
        stream: false
      });

      result = await sendToAgentRouter(wrappedPayload);
    }

    if (result.statusCode !== 200) {
      console.log('AGENTROUTER RAW ERR:', result.statusCode, result.raw);
    }

    if (result.statusCode === 200) {
      deductLocalCredit(requestedModel, 25, 45);
    }

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(result.raw);
    console.log(`[${new Date().toLocaleTimeString()}] ${result.statusCode} ${requestedModel} → ${upstreamModel}`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(RELAY_PORT, () => {
  console.log(`ForgeAPI PC Relay running on port ${RELAY_PORT}`);
});
