import http from 'node:http';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * Generates realistic mock user data for a given ID.
 * Contains all fields required by Drift Sentinel:
 * - user_name
 * - email
 * - address.city
 * - orders[].total
 * - plan
 * - joined_at
 * - legacy_flag
 */
export function getMockUser(id) {
  return {
    id: String(id),
    user_name: 'alex_chen',
    email: 'alex.chen@example.com',
    address: {
      street: '742 Evergreen Terrace',
      city: 'Springfield',
      state: 'OR',
      postal_code: '97477',
      country: 'USA'
    },
    orders: [
      {
        id: 'ord-1001',
        total: 89.99,
        currency: 'USD',
        status: 'delivered',
        created_at: '2024-01-15T12:00:00.000Z'
      },
      {
        id: 'ord-1002',
        total: 245.50,
        currency: 'USD',
        status: 'shipped',
        created_at: '2024-02-01T15:30:00.000Z'
      }
    ],
    plan: 'premium',
    joined_at: '2023-04-12T09:15:30.000Z',
    legacy_flag: false
  };
}

/**
 * Request handler for demo-api.
 */
export function createRequestHandler() {
  return function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // Route: GET /users/:id
    const userMatch = pathname.match(/^\/users\/([^/?#]+)$/);
    if (req.method === 'GET' && userMatch) {
      let userId;
      try {
        userId = decodeURIComponent(userMatch[1]);
      } catch {
        res.writeHead(400, {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({ error: 'Invalid URL encoding' }));
        return;
      }

      const user = getMockUser(userId);

      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(user, null, 2));
      return;
    }

    // 404 for other endpoints
    res.writeHead(404, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ error: 'Not Found' }));
  };
}

export function createApp() {
  const handler = createRequestHandler();
  return http.createServer(handler);
}
