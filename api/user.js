// In-memory persistent user state across invocations
const users = new Map();

// Helper to get or initialize user
function getUser(id, defaultUsername) {
  if (!id) return null;
  if (!users.has(id)) {
    users.set(id, {
      id,
      username: defaultUsername || `dev_${id.slice(-6)}`,
      credits: 25.00,
      plan: 'Max',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
  }
  return users.get(id);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    const id = url.searchParams.get('id') || req.headers['x-user-id'] || 'default_user';
    const user = getUser(id);
    return res.status(200).json({ success: true, user });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch(e) { body = {}; }
    }

    const id = body.id || req.headers['x-user-id'] || `usr_${Math.random().toString(36).slice(2, 10)}`;
    const username = (body.username || '').trim() || `dev_${id.slice(-6)}`;
    
    let user = users.get(id);
    if (!user) {
      user = {
        id,
        username,
        credits: typeof body.credits === 'number' ? body.credits : 25.00,
        plan: body.plan || 'Max',
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      users.set(id, user);
    } else {
      if (body.username) user.username = username;
      if (typeof body.credits === 'number') user.credits = body.credits;
      if (body.plan) user.plan = body.plan;
      user.lastSeen = new Date().toISOString();
    }

    return res.status(200).json({ success: true, user });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
