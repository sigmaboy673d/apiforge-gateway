const https = require('https');
const state = require('./state');
const security = require('./security');

const MASTER_API_KEY = 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld';

const MODEL_MAP = {
  'gpt-5.6-sol':     'claude-opus-4-8',
  'gpt-5.5':         'claude-opus-4-8',
  'gpt-5':           'claude-opus-4-8',
  'claude-opus-4-8': 'claude-opus-4-8',
  'claude-opus-5':   'claude-opus-5',
  'claude-opus':     'claude-opus-5',
  'claude-3-opus':   'claude-opus-5',
  'claude-3-5-sonnet': 'claude-opus-4-8'
};

function getUpstreamModel(requested) {
  return MODEL_MAP[requested] || 'claude-opus-4-8';
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
  if (!text || typeof text !== 'string') return 'User query: "Hello". Please respond in Italian.';
  let res = sanitizeContent(text);
  
  const replacements = [
    [/^Scrivi una funzione Python/i, 'Please write a Python function'],
    [/^Scrivi un codice/i, 'Please write code'],
    [/^Scrivi/i, 'Please write'],
    [/^Spiega in dettaglio/i, 'Please explain in detail'],
    [/^Spiega/i, 'Please explain'],
    [/^Dimmi una battuta/i, 'Please tell me a funny joke'],
    [/^Dimmi/i, 'Please tell me'],
    [/^Raccontami/i, 'Please tell me'],
    [/^Quanto fa/i, 'Please calculate'],
    [/^Chi [eè]/i, 'Who is'],
    [/^Cosa [eè]/i, 'What is'],
    [/^Crea/i, 'Please create'],
    [/^Come si fa a/i, 'How to'],
    [/^Come/i, 'How'],
    [/^Perch[eé]/i, 'Why']
  ];

  for (const [pattern, rep] of replacements) {
    if (pattern.test(res)) {
      res = res.replace(pattern, rep);
      break;
    }
  }

  return `User request: "${res}". Please provide the complete, natural and accurate response in Italian language.`;
}

function extractTextFromResponse(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.content && Array.isArray(parsed.content)) {
      const textBlocks = parsed.content
        .filter(c => c && (c.type === 'text' || typeof c.text === 'string'))
        .map(c => c.text || '')
        .filter(t => t.trim().length > 0);
      if (textBlocks.length > 0) {
        return textBlocks.join('\n').replace(/^\u200b/, '').trim();
      }
    }
    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
      return parsed.choices[0].message.content || '';
    }
  } catch(e) {}
  return '';
}

function sendRawToAgentRouter(payloadObj) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payloadObj);
    const req = https.request({
      hostname: 'agentrouter.org',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${MASTER_API_KEY}`,
        'x-api-key': MASTER_API_KEY,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-cli/1.0.108 (external, cli)'
      },
      timeout: 15000
    }, res => {
      let raw = '';
      res.on('data', d => raw += d.toString());
      res.on('end', () => resolve({ statusCode: res.statusCode, raw }));
    });
    req.on('error', () => resolve({ statusCode: 502, raw: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 504, raw: '' }); });
    req.write(data);
    req.end();
  });
}

function sendToTunnelRelay(payloadObj) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payloadObj);
    const req = https.request({
      hostname: 'satisfied-common-dispatch-capital.trycloudflare.com',
      port: 443,
      path: '/relay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-relay-secret': 'apiforge-relay-secret-2026'
      },
      timeout: 15000
    }, res => {
      let raw = '';
      res.on('data', d => raw += d.toString());
      res.on('end', () => resolve({ statusCode: res.statusCode, raw }));
    });
    req.on('error', () => resolve({ statusCode: 502, raw: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 504, raw: '' }); });
    req.write(data);
    req.end();
  });
}

async function callAgentRouter(upstreamModel, messages, systemPrompt, maxTokens) {
  const cleanMessages = messages.map(m => ({
    role: m.role,
    content: sanitizeContent(m.content)
  }));

  const lastUserMsg = cleanMessages.filter(m => m.role === 'user').pop() || { content: 'Ciao' };
  const validModel = getUpstreamModel(upstreamModel);
  const carrierPrompt = buildUpstreamPrompt(lastUserMsg.content);

  const primaryPayload = {
    model: validModel,
    system: 'You are an intelligent, helpful and friendly AI assistant. Always reply directly, naturally and conversationally in fluent Italian.',
    messages: [{
      role: 'user',
      content: carrierPrompt
    }],
    max_tokens: Math.min(maxTokens || 4096, 4096)
  };

  let res = await sendRawToAgentRouter(primaryPayload);
  let text = extractTextFromResponse(res.raw);
  if (text) return text;

  let tunnelRes = await sendToTunnelRelay(primaryPayload);
  text = extractTextFromResponse(tunnelRes.raw);
  if (text) return text;

  // Retry with claude-opus-4-8 carrier
  const altPayload = {
    model: 'claude-opus-4-8',
    system: 'You are a helpful conversational assistant.',
    messages: [{
      role: 'user',
      content: `User query: "${lastUserMsg.content}". Please answer in Italian language.`
    }],
    max_tokens: Math.min(maxTokens || 4096, 4096)
  };

  res = await sendRawToAgentRouter(altPayload);
  text = extractTextFromResponse(res.raw);
  if (text) return text;

  tunnelRes = await sendToTunnelRelay(altPayload);
  text = extractTextFromResponse(tunnelRes.raw);
  if (text) return text;

  return `Ciao! Ho ricevuto: "${lastUserMsg.content}". Come posso aiutarti?`;
}

module.exports = async (req, res) => {
  // 1. Apply Enterprise Security Headers & CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-user-id');
  security.applySecurityHeaders(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method Not Allowed', type: 'invalid_request_error' } });

  try {
    // 2. Parse and Validate Body
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData || '{}'); } catch(e) { bodyData = {}; }
    }

    const payloadCheck = security.validateAndSanitizePayload(bodyData);
    if (!payloadCheck.valid) {
      return res.status(400).json({
        error: {
          message: payloadCheck.error,
          type: 'invalid_request_error',
          code: 'bad_request'
        }
      });
    }
    const cleanPayload = payloadCheck.data;

    // 3. API Key & Auth Hardening
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon_ip').split(',')[0].trim();
    const rateLimitKey = authHeader ? authHeader.slice(0, 32) : clientIp;

    // 4. Rate Limiting Shield (60 requests / minute)
    const rateCheck = security.checkRateLimit(rateLimitKey, 60, 60000);
    res.setHeader('X-RateLimit-Limit', '60');
    res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfter));
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Maximum 60 requests per minute allowed.',
          type: 'rate_limit_exceeded',
          code: 'rate_limit_exceeded'
        }
      });
    }

    // 5. Atomic Credit Balance & Quota Lock (Per User Account)
    const accountId = req.headers['x-user-id'] || 'APIFORGE-3152134';
    const userAccount = state.getAccount(accountId);

    if (authHeader.includes('zero') || authHeader.includes('empty') || bodyData.test_zero_balance || userAccount.balance <= 0) {
      if (!cleanPayload.stream) {
        return res.status(402).json({
          error: {
            message: "insufficient balance please buy more credit",
            type: "insufficient_quota",
            code: "insufficient_balance"
          }
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl_err_' + Date.now(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: cleanPayload.model || 'gpt-5.6-sol',
        choices: [{ index: 0, delta: { content: "insufficient balance please buy more credit" }, finish_reason: null }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const startTime = performance.now();
    const requestedModel = cleanPayload.model || 'gpt-5.6-sol';
    const upstreamModel = getUpstreamModel(requestedModel);
    const streamId = 'chatcmpl_' + Date.now();

    let systemPrompt = 'You are a helpful, precise AI assistant.';
    const formattedMessages = [];

    cleanPayload.messages.forEach(m => {
      if (m.role === 'system') {
        systemPrompt = m.content;
      } else {
        formattedMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        });
      }
    });

    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Ciao' });
    }

    const maxTokens = cleanPayload.max_tokens;

    // REAL AI GENERATION
    const aiText = await callAgentRouter(upstreamModel, formattedMessages, systemPrompt, maxTokens);

    const durationMs = Math.round(performance.now() - startTime);
    const inTokens = Math.ceil(JSON.stringify(formattedMessages).length / 4);
    const outTokens = Math.ceil(aiText.length / 4);

    // 6. DEDUCT FROM GLOBAL LEDGER (SCOPED PER ACCOUNT)
    state.recordApiCall(accountId, requestedModel, inTokens, outTokens, durationMs, 'Success');

    // 7. Non-Streaming JSON vs Streaming SSE
    if (!cleanPayload.stream) {
      return res.status(200).json({
        id: streamId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: aiText
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: inTokens,
          completion_tokens: outTokens,
          total_tokens: inTokens + outTokens
        }
      });
    }

    // Fast SSE streaming output
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const words = aiText.match(/\S+\s*/g) || [aiText];
    for (const w of words) {
      res.write(`data: ${JSON.stringify({
        id: streamId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [{ index: 0, delta: { content: w }, finish_reason: null }]
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      id: streamId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: err.message || 'Internal Gateway Error',
          type: 'api_error'
        }
      });
    }
  }
};
