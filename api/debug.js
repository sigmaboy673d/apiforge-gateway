const https = require('https');
const MASTER_API_KEY = 'sk-e3C9Uk4FuzqRl7D9Gyxu2n9OhCzufx8XUaNO2vdSWAkECCld';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const payload = JSON.stringify({
    model: 'gpt-5.6-sol',
    messages: [{ role: 'user', content: 'ciao, come stai?' }],
    max_tokens: 300,
    stream: false,
    system: 'You are a helpful assistant.'
  });

  return new Promise((resolve) => {
    const upstreamReq = https.request({
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
        'User-Agent': 'claude-cli/1.0.108 (external, cli)',
        'x-stainless-lang': 'js',
        'x-stainless-package-version': '0.32.0',
        'x-stainless-os': 'Windows',
        'x-stainless-arch': 'x64',
        'x-stainless-runtime': 'node',
        'x-stainless-runtime-version': 'v20.0.0'
      },
      timeout: 30000
    }, upstreamRes => {
      let raw = '';
      upstreamRes.on('data', d => raw += d.toString());
      upstreamRes.on('end', () => {
        res.status(200).json({
          upstream_status: upstreamRes.statusCode,
          upstream_headers: upstreamRes.headers,
          upstream_body_raw: raw,
          upstream_body_length: raw.length
        });
        resolve();
      });
    });

    upstreamReq.on('error', err => {
      res.status(200).json({ error: err.message });
      resolve();
    });

    upstreamReq.write(payload);
    upstreamReq.end();
  });
};
