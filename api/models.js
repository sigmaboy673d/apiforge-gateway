module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  res.status(200).json({
    object: 'list',
    data: [
      {
        id: 'gpt-5.6-sol',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'forgeapi',
        permission: [],
        root: 'gpt-5.6-sol',
        parent: null
      },
      {
        id: 'claude-opus-4-8',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'forgeapi',
        permission: [],
        root: 'claude-opus-4-8',
        parent: null
      },
      {
        id: 'claude-opus-5',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'forgeapi',
        permission: [],
        root: 'claude-opus-5',
        parent: null
      }
    ]
  });
};
