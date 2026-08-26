const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getIndexHtmlPath() {
  const candidates = [
    path.join(app.getAppPath(), 'frontend', 'dist', 'index.html'),
    path.join(__dirname, '..', 'frontend', 'dist', 'index.html'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function isViteDevServerUp() {
  return new Promise((resolve) => {
    const http = require('http');
    
    const check = (host) => {
      return new Promise((resCheck) => {
        const url = `http://${host}:5173`;
        const req = http.get(url, (res) => {
          res.resume();
          resCheck(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resCheck(false));
        req.setTimeout(1000, () => {
          req.destroy();
          resCheck(false);
        });
      });
    };

    (async () => {
      const isUp = await check('localhost') || await check('127.0.0.1');
      resolve(isUp);
    })();
  });
}

module.exports = { getIndexHtmlPath, isViteDevServerUp };
