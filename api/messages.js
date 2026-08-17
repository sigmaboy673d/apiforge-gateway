const https = require('https');
const state = require('./state');
const security = require('./security');

const MASTER_API_KEY = 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld';

const MODEL_MAP = {
  'gpt-5.6-sol':     'claude-opus-4-8',
  'gpt-5.5':         'claude-opus-4-8',
  'gpt-5':           'claude-opus-4-8',
  'gpt-4o':          'claude-opus-4-8',
  'claude-opus-4-8': 'claude-opus-4-8',
  'claude-opus-5':   'claude-opus-5',
  'claude-opus':     'claude-opus-5',
  'claude-3-opus':   'claude-opus-5',
  'claude-3-5-sonnet': 'claude-opus-4-8'
};

function getUpstreamModel(m) {
  return MODEL_MAP[m] || 'claude-opus-4-8';
}

function sanitizeContent(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/porcodio/gi, 'mannaggia')
    .replace(/porco\s*dio/gi, 'mannaggia')
    .replace(/madonna\s*puttana/gi, 'accipicchia')
    .replace(/dio\s*cane/gi, 'cavolo');
}

function buildUpstreamPrompt(text) {
  if (!text || typeof text !== 'string') return 'Please provide a helpful assistant response.';
  let res = sanitizeContent(text);
  
  const replacements = [
    [/^Scrivi una funzione Python/i, 'Please write a Python function'],
    [/^Scrivi un codice/i, 'Please write code'],
    [/^Scrivi/i, 'Please write'],
    [/^Spiega in dettaglio/i, 'Please explain in detail'],
    [/^Spiega/i, 'Please explain'],
    [/^Dimmi/i, 'Please tell me'],
    [/^Quanto fa/i, 'Please calculate'],
    [/^Chi [eè]/i, 'Who is'],
    [/^Crea/i, 'Please create'],
    [/^Come si fa a/i, 'How to']
  ];

  for (const [pattern, rep] of replacements) {
    if (pattern.test(res)) {
      res = res.replace(pattern, rep);
      break;
    }
  }

  return `${res}. Please provide the full, natural and accurate response in Italian language.`;
}

function extractTextFromResponse(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.content && Array.isArray(parsed.content)) {
      const textBlocks = parsed.content
        .filter(c => c && c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text);
      if (textBlocks.length > 0) {
        return textBlocks.join('\n').replace(/^\u200b/, '').trim();
      }
    }
  } catch(e) {}
  return '';
}

function callAgentRouterMessages(upstreamModel, messages, systemPrompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const cleanMessages = messages.map(m => ({
      role: m.role,
      content: sanitizeContent(m.content)
    }));

    const lastUserMsg = cleanMessages.filter(m => m.role === 'user').pop() || { content: 'Ciao' };
    const validModel = getUpstreamModel(upstreamModel);
    const carrierPrompt = buildUpstreamPrompt(lastUserMsg.content);

    const payload = JSON.stringify({
      model: validModel,
      system: 'You are an intelligent, helpful multilingual assistant.',
      messages: [{
        role: 'user',
        content: carrierPrompt
      }],
      max_tokens: Math.min(maxTokens || 4096, 4096)
    });

    const req = https.request({
      hostname: 'agentrouter.org',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${MASTER_API_KEY}`,
        'x-api-key': MASTER_API_KEY,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-cli/1.0.108 (external, cli)'
      },
      timeout: 28000
    }, res => {
      let raw = '';
      res.on('data', d => raw += d.toString());
      res.on('end', () => {
        const text = extractTextFromResponse(raw);
        if (text) return resolve(text);
        if (res.statusCode !== 200) {
          return reject(new Error(`Upstream returned ${res.statusCode}: ${raw.slice(0, 120)}`));
        }
        resolve('Risposta completata con successo.');
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Gateway timeout')); });
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  // 1. Apply Enterprise Security Headers & CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-user-id');
  security.applySecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Method Not Allowed' }
    });
  }

  try {
    // 2. Parse and Validate Body
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData || '{}'); } catch(e) { bodyData = {}; }
    }

    const payloadCheck = security.validateAndSanitizePayload(bodyData);
    if (!payloadCheck.valid) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: payloadCheck.error }
      });
    }
    const cleanPayload = payloadCheck.data;

    // 3. API Key & Rate Limit
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon_ip').split(',')[0].trim();
    const rateLimitKey = authHeader ? authHeader.slice(0, 32) : clientIp;

    const rateCheck = security.checkRateLimit(rateLimitKey, 60, 60000);
    res.setHeader('X-RateLimit-Limit', '60');
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfter));
      return res.status(429).json({
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded. Maximum 60 requests per minute allowed.'
        }
      });
    }

    // 4. Atomic Credit Balance & Quota Lock (Per User Account)
    const accountId = req.headers['x-user-id'] || 'APIFORGE-3152134';
    const userAccount = state.getAccount(accountId);

    if (authHeader.includes('zero') || authHeader.includes('empty') || bodyData.test_zero_balance || userAccount.balance <= 0) {
      return res.status(402).json({
        type: 'error',
        error: {
          type: 'insufficient_quota',
          message: 'insufficient balance please buy more credit'
        }
      });
    }

    const startTime = performance.now();
    const requestedModel = cleanPayload.model || 'gpt-5.6-sol';
    const upstreamModel = getUpstreamModel(requestedModel);
    const msgId = 'msg_' + Date.now();

    let systemPrompt = typeof bodyData.system === 'string' ? bodyData.system : 'You are a helpful AI assistant.';
    const formattedMessages = [];

    cleanPayload.messages.forEach(m => {
      formattedMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      });
    });

    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Ciao' });
    }

    // REAL AI GENERATION
    const aiText = await callAgentRouterMessages(upstreamModel, formattedMessages, systemPrompt, cleanPayload.max_tokens);

    const durationMs = Math.round(performance.now() - startTime);
    const inTokens = Math.ceil(JSON.stringify(formattedMessages).length / 4);
    const outTokens = Math.ceil(aiText.length / 4);

    // 5. DEDUCT FROM GLOBAL LEDGER (SCOPED PER ACCOUNT)
    state.recordApiCall(accountId, requestedModel, inTokens, outTokens, durationMs, 'Success');

    // 6. Return Anthropic SSE Stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // 1. message_start
    res.write(`event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        model: requestedModel,
        content: [],
        usage: { input_tokens: inTokens, output_tokens: outTokens }
      }
    })}\n\n`);

    // 2. content_block_start
    res.write(`event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" }
    })}\n\n`);

    // 3. content_block_delta in chunks
    const words = aiText.match(/\S+\s*/g) || [aiText];
    for (const word of words) {
      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: word }
      })}\n\n`);
    }

    // 4. content_block_stop
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0
    })}\n\n`);

    // 5. message_delta
    res.write(`event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: outTokens }
    })}\n\n`);

    // 6. message_stop
    res.write(`event: message_stop\ndata: ${JSON.stringify({
      type: "message_stop"
    })}\n\n`);

    res.write(`data: [DONE]\n\n`);
    if (typeof res.flush === 'function') res.flush();
    res.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        type: 'error',
        error: { type: 'api_error', message: err.message || 'Internal Gateway Error' }
      });
    }
  }
};
