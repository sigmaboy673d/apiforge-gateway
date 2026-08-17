const state = require('./state');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const accountId = req.headers['x-user-id'] || url.searchParams.get('id') || 'APIFORGE-3152134';

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: state.getOverview(accountId)
    });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch(e) { body = {}; }
    }

    const targetId = body.id || accountId;
    if (body.action === 'add' && typeof body.amount === 'number') {
      state.addCredits(targetId, body.amount);
    } else if (body.action === 'set' && typeof body.amount === 'number') {
      state.setBalance(targetId, body.amount);
    }

    return res.status(200).json({
      success: true,
      data: state.getOverview(targetId)
    });
  }

  res.status(405).json({ error: 'Method Not Allowed' });
};
