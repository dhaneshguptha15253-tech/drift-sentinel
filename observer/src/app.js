import http from 'node:http';
import { defaultStore } from './store.js';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * Creates the HTTP request handler for the observer service.
 * @param {import('./store.js').UsageStore} [store=defaultStore]
 */
export function createRequestHandler(store = defaultStore) {
  return function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // CORS preflight handling
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // GET /usage
    if (req.method === 'GET' && pathname === '/usage') {
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(store.getUsage(), null, 2));
      return;
    }

    // POST /reports
    if (req.method === 'POST' && pathname === '/reports') {
      let bodyData = '';
      let isOversized = false;
      const MAX_BODY_SIZE = 1e6; // 1 MB
      req.setEncoding('utf8');

      req.on('data', (chunk) => {
        if (isOversized) {
          return;
        }
        bodyData += chunk;
        if (bodyData.length > MAX_BODY_SIZE) {
          isOversized = true;
          bodyData = '';
          res.writeHead(413, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          if (typeof req.resume === 'function') {
            req.resume();
          }
        }
      });

      req.on('end', () => {
        if (isOversized || res.writableEnded) {
          return;
        }
        try {
          if (!bodyData.trim()) {
            throw new Error('Request body cannot be empty');
          }
          const report = JSON.parse(bodyData);
          store.recordReport(report);

          res.writeHead(200, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify({ ok: true, message: 'Report accepted' }));
        } catch (err) {
          if (!res.writableEnded) {
            res.writeHead(400, {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
      });

      req.on('error', (err) => {
        if (!res.writableEnded) {
          res.writeHead(400, {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Route not found
    res.writeHead(404, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ error: 'Not Found' }));
  };
}

export function createApp(store = defaultStore) {
  const handler = createRequestHandler(store);
  return http.createServer(handler);
}
