// In-memory credit ledger
const userHandler = require('./user');

// Global credits cache
const creditsLedger = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    const id = url.searchParams.get('id') || req.headers['x-user-id'];
    if (!id) return res.status(400).json({ error: 'User ID required' });

    const balance = creditsLedger.has(id) ? creditsLedger.get(id) : 25.00;
    return res.status(200).json({
      id,
      credits: balance,
      formatted: `$${balance.toFixed(2)}`,
      status: 'active'
    });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch(e) { body = {}; }
    }

    const id = body.id || req.headers['x-user-id'];
    if (!id) return res.status(400).json({ error: 'User ID required' });

    const action = body.action || 'add'; // 'add' | 'deduct' | 'set'
    const amount = typeof body.amount === 'number' ? Math.abs(body.amount) : 0;

    let current = creditsLedger.has(id) ? creditsLedger.get(id) : 25.00;

    if (action === 'add') {
      current += amount;
    } else if (action === 'deduct') {
      current = Math.max(0, current - amount);
    } else if (action === 'set') {
      current = amount;
    }

    creditsLedger.set(id, current);

    return res.status(200).json({
      success: true,
      id,
      action,
      amount,
      credits: current,
      formatted: `$${current.toFixed(2)}`,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
