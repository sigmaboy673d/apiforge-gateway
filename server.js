const http = require('http');
const path = require('path');
const fs = require('fs');

const messagesHandler = require('./api/messages');
const completionsHandler = require('./api/completions');
const modelsHandler = require('./api/models');
const keysHandler = require('./api/keys');
const healthHandler = require('./api/health');
const testUpstreamHandler = require('./api/test_upstream');
const userHandler = require('./api/user');
const creditsHandler = require('./api/credits');
const overviewHandler = require('./api/overview');
const state = require('./api/state');

const PORT = process.env.PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function enrichResponse(res) {
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  res.send = function(data) {
    res.end(data);
  };
}

const server = http.createServer(async (req, res) => {
  enrichResponse(res);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  function getParsedBody() {
    return new Promise(resolve => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve(body);
        }
      });
    });
  }

  // Routes
  if (url === '/v1/messages' || url === '/api/messages') {
    req.body = await getParsedBody();
    await messagesHandler(req, res);
    return;
  }

  if (url === '/v1/chat/completions' || url === '/api/completions') {
    req.body = await getParsedBody();
    await completionsHandler(req, res);
    return;
  }

  if (url === '/v1/models' || url === '/api/models') {
    modelsHandler(req, res);
    return;
  }

  if (url === '/v1/health' || url === '/api/health') {
    healthHandler(req, res);
    return;
  }

  if (url === '/api/overview') {
    req.body = await getParsedBody();
    await overviewHandler(req, res);
    return;
  }

  if (url === '/api/test_upstream') {
    await testUpstreamHandler(req, res);
    return;
  }

  if (url === '/api/keys') {
    req.body = await getParsedBody();
    keysHandler(req, res);
    return;
  }

  if (url === '/api/user') {
    req.body = await getParsedBody();
    await userHandler(req, res);
    return;
  }

  if (url === '/api/credits') {
    req.body = await getParsedBody();
    await creditsHandler(req, res);
    return;
  }

  if (url === '/api/balance') {
    const accountId = req.headers['x-user-id'] || 'APIFORGE-3152134';
    const account = state.getAccount(accountId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      accountId: account.id,
      balance: account.balance,
      formatted: '$' + account.balance.toFixed(2),
      spend: '$' + (account.spend || 0).toFixed(2),
      totalRequests: account.totalRequests || 0
    }));
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ForgeAPI Server running on port ${PORT}`);
});
