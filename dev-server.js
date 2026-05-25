const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;

// Import the player function
const { handler } = require('./netlify/functions/player.js');

const server = http.createServer(async (req, res) => {
  // Handle API routes
  if (req.url.startsWith('/api/')) {
    // Convert /api/player?id=123 to Netlify function format
    const event = {
      httpMethod: req.method,
      path: req.url,
      queryStringParameters: new URLSearchParams(req.url.split('?')[1] || '').entries() ? Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || '')) : null,
    };

    try {
      const result = await handler(event);
      res.writeHead(result.statusCode, result.headers || {});
      res.end(result.body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    }[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n📡 Dev server running at http://localhost:${PORT}`);
  console.log('Test with player #75412 (Rich Ott)\n');
});
