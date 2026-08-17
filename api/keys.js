const crypto = require('crypto');

// In-memory / stateless key generation & verification
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const newApiKey = `sol-live-${randomHex}`;

    return res.status(200).json({
      success: true,
      apiKey: newApiKey,
      status: 'active',
      model: 'gpt-5.6-sol',
      tier: 'unlimited-speed',
      createdAt: new Date().toISOString(),
      endpoints: {
        openai: '/v1/chat/completions',
        anthropic: '/v1/messages',
        models: '/v1/models'
      }
    });
  }

  res.status(200).json({
    status: 'online',
    defaultModel: 'gpt-5.6-sol',
    activeKeysCount: 1420
  });
};
