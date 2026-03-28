const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // Proxy: /api/analyze → Anthropic API
  if (req.method === 'POST' && req.url === '/api/analyze') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let parsed;
      try { parsed = JSON.parse(body); } catch(e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Use server env key — ignore any key sent from client
      delete parsed.apiKey;
      const apiKey = ANTHROPIC_KEY;
      if (!apiKey) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set on server' }));
        return;
      }

      const postData = JSON.stringify(parsed);
      const postBuffer = Buffer.from(postData, 'utf8');

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postBuffer.length,
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        const resChunks = [];
        proxyRes.on('data', chunk => resChunks.push(chunk));
        proxyRes.on('end', () => {
          const data = Buffer.concat(resChunks).toString('utf8');
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxyReq.on('error', (e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(postBuffer);
      proxyReq.end();
    });
    return;
  }

  // Static files
  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`LightMate running on port ${PORT}`);
});
