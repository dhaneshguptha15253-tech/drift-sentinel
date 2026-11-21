import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRequestHandler, getMockUser } from '../src/app.js';

function invokeHandler(handler, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (body !== null && body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const req = new Readable({
      read() {
        if (payload !== null) {
          this.push(Buffer.from(payload));
          payload = null;
        }
        this.push(null);
      },
    });

    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost', ...headers };

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';

    const res = {
      writeHead(code, hdrs = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(hdrs)) {
          responseHeaders[k.toLowerCase()] = v;
        }
        return this;
      },
      setHeader(key, value) {
        responseHeaders[key.toLowerCase()] = value;
        return this;
      },
      getHeader(key) {
        return responseHeaders[key.toLowerCase()];
      },
      write(chunk) {
        responseBody += chunk.toString();
        return true;
      },
      end(chunk) {
        if (chunk) responseBody += chunk.toString();
        resolve({
          status: statusCode,
          headers: responseHeaders,
          getHeader(k) {
            return responseHeaders[k.toLowerCase()];
          },
          text: () => Promise.resolve(responseBody),
          json: () => Promise.resolve(JSON.parse(responseBody)),
        });
      },
      destroy(err) {
        if (err) reject(err);
      },
    };

    try {
      handler(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

describe('demo-api', () => {
  const handler = createRequestHandler();

  test('getMockUser returns all required fields', () => {
    const user = getMockUser('42');
    assert.equal(user.id, '42');
    assert.equal(typeof user.user_name, 'string');
    assert.equal(typeof user.email, 'string');
    assert.ok(user.address && typeof user.address.city === 'string');
    assert.ok(Array.isArray(user.orders) && user.orders.length > 0);
    assert.equal(typeof user.orders[0].total, 'number');
    assert.equal(typeof user.plan, 'string');
    assert.equal(typeof user.joined_at, 'string');
    assert.equal(typeof user.legacy_flag, 'boolean');
  });

  test('GET /users/:id returns 200 with realistic user payload', async () => {
    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/users/123',
    });

    assert.equal(res.status, 200);
    assert.match(res.getHeader('content-type') || '', /application\/json/);

    const body = await res.json();
    assert.equal(body.id, '123');
    assert.equal(body.user_name, 'alex_chen');
    assert.equal(body.email, 'alex.chen@example.com');
    assert.equal(body.address.city, 'Springfield');
    assert.ok(Array.isArray(body.orders));
    assert.equal(typeof body.orders[0].total, 'number');
    assert.equal(body.plan, 'premium');
    assert.equal(body.joined_at, '2023-04-12T09:15:30.000Z');
    assert.equal(body.legacy_flag, false);
  });

  test('GET /users/:id includes CORS headers', async () => {
    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/users/user-abc',
    });

    assert.equal(res.status, 200);
    assert.equal(res.getHeader('access-control-allow-origin'), '*');
  });

  test('OPTIONS preflight request returns 204 with CORS headers', async () => {
    const res = await invokeHandler(handler, {
      method: 'OPTIONS',
      url: '/users/user-abc',
    });

    assert.equal(res.status, 204);
    assert.equal(res.getHeader('access-control-allow-origin'), '*');
    assert.match(res.getHeader('access-control-allow-methods') || '', /GET/);
  });

  test('GET /unknown-route returns 404', async () => {
    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/unknown-route',
    });

    assert.equal(res.status, 404);
  });

  test('GET /users/:id with malformed URL encoding returns 400 with CORS headers', async () => {
    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/users/%E0%A4%A',
    });

    assert.equal(res.status, 400);
    assert.equal(res.getHeader('access-control-allow-origin'), '*');
    assert.match(res.getHeader('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'Invalid URL encoding');

    // Verify server did not crash and subsequent request works
    const nextRes = await invokeHandler(handler, {
      method: 'GET',
      url: '/users/user-123',
    });
    assert.equal(nextRes.status, 200);
  });
});
