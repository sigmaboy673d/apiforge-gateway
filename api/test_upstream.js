const https = require('https');

const MASTER_API_KEY = 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const payload = JSON.stringify({
    model: 'gpt-5.6-sol',
    messages: [{ role: 'user', content: 'ciao' }],
    max_tokens: 100,
    stream: false,
    system: 'You are Claude.'
  });

  const wireHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'x-api-key': MASTER_API_KEY,
    'Authorization': `Bearer ${MASTER_API_KEY}`,
    'anthropic-version': '2023-06-01',
    'User-Agent': 'claude-cli/1.0.108 (external, cli)',
    'x-stainless-lang': 'js',
    'x-stainless-package-version': '0.32.0',
    'x-stainless-os': 'Windows',
    'x-stainless-arch': 'x64',
    'x-stainless-runtime': 'node',
    'x-stainless-runtime-version': 'v20.0.0',
    'HTTP-Referer': 'https://endpoint-proxy.local',
    'X-Title': 'OpenCode-AgentRouter-Bridge'
  };

  return new Promise(resolve => {
    const upstreamReq = https.request({
      hostname: 'agentrouter.org',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: wireHeaders,
      timeout: 10000
    }, upstreamRes => {
      let body = '';
      upstreamRes.on('data', d => body += d.toString());
      upstreamRes.on('end', () => {
        res.status(200).json({
          status: upstreamRes.statusCode,
          headers: upstreamRes.headers,
          body: body
        });
        resolve();
      });
    });

    upstreamReq.on('error', err => {
      res.status(500).json({ error: err.message });
      resolve();
    });

    upstreamReq.write(payload);
    upstreamReq.end();
  });
};
