import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { UsageStore } from '../src/store.js';
import { createRequestHandler } from '../src/app.js';

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

describe('observer service', () => {
  let store;
  let handler;

  beforeEach(() => {
    store = new UsageStore();
    handler = createRequestHandler(store);
  });

  test('GET /usage returns empty object initially', async () => {
    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/usage',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, {});
  });

  test('POST /reports records reads and GET /usage returns expected format', async () => {
    const report1 = {
      client: 'web',
      version: '1',
      strict: false,
      reads: [
        { endpoint: 'GET /users/:id', path: 'user_name' },
        { endpoint: 'GET /users/:id', path: 'email' },
      ],
    };

    const postRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: report1,
    });

    assert.equal(postRes.status, 200);
    const postBody = await postRes.json();
    assert.equal(postBody.ok, true);

    const getRes = await invokeHandler(handler, {
      method: 'GET',
      url: '/usage',
    });
    assert.equal(getRes.status, 200);
    const usage = await getRes.json();

    assert.deepEqual(usage, {
      'GET /users/:id': {
        user_name: [{ client: 'web', version: '1', strict: false }],
        email: [{ client: 'web', version: '1', strict: false }],
      },
    });
  });

  test('Merging multiple reports from different versions preserves existing entries', async () => {
    // First report: web v1 reads user_name and email
    await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        strict: false,
        reads: [
          { endpoint: 'GET /users/:id', path: 'user_name' },
          { endpoint: 'GET /users/:id', path: 'email' },
        ],
      },
    });

    // Second report: web v2 reads email
    await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '2',
        strict: false,
        reads: [{ endpoint: 'GET /users/:id', path: 'email' }],
      },
    });

    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/usage',
    });
    const usage = await res.json();

    // Exactly matches docs/formats.md section 2
    assert.deepEqual(usage, {
      'GET /users/:id': {
        user_name: [{ client: 'web', version: '1', strict: false }],
        email: [
          { client: 'web', version: '1', strict: false },
          { client: 'web', version: '2', strict: false },
        ],
      },
    });
  });

  test('Avoid duplicate identical usage entries on repeated reports', async () => {
    const report = {
      client: 'web',
      version: '1',
      strict: false,
      reads: [
        { endpoint: 'GET /users/:id', path: 'user_name' },
        { endpoint: 'GET /users/:id', path: 'orders[].total' },
      ],
    };

    // Submit report 3 times
    for (let i = 0; i < 3; i++) {
      const res = await invokeHandler(handler, {
        method: 'POST',
        url: '/reports',
        body: report,
      });
      assert.equal(res.status, 200);
    }

    const res = await invokeHandler(handler, {
      method: 'GET',
      url: '/usage',
    });
    const usage = await res.json();

    assert.equal(usage['GET /users/:id']['user_name'].length, 1);
    assert.equal(usage['GET /users/:id']['orders[].total'].length, 1);
    assert.deepEqual(usage['GET /users/:id']['user_name'][0], {
      client: 'web',
      version: '1',
      strict: false,
    });
  });

  test('Supports CORS headers on OPTIONS, GET, and POST', async () => {
    // OPTIONS
    const optRes = await invokeHandler(handler, {
      method: 'OPTIONS',
      url: '/reports',
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.getHeader('access-control-allow-origin'), '*');
    assert.match(optRes.getHeader('access-control-allow-methods') || '', /POST/);

    // GET
    const getRes = await invokeHandler(handler, {
      method: 'GET',
      url: '/usage',
    });
    assert.equal(getRes.getHeader('access-control-allow-origin'), '*');

    // POST
    const postRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        strict: false,
        reads: [{ endpoint: 'GET /users/:id', path: 'user_name' }],
      },
    });
    assert.equal(postRes.headers['access-control-allow-origin'], '*');
  });

  test('Rejects invalid report payloads with 400', async () => {
    // Invalid JSON body
    const badJsonRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: 'not a json',
    });
    assert.equal(badJsonRes.status, 400);

    // Missing client
    const noClientRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: { version: '1', reads: [] },
    });
    assert.equal(noClientRes.status, 400);

    // Missing reads
    const noReadsRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: { client: 'web', version: '1' },
    });
    assert.equal(noReadsRes.status, 400);
  });

  test('Oversized request body (>1MB) returns 413 without double-response', async () => {
    const oversizedBody = 'a'.repeat(1_000_005);
    const res = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: oversizedBody,
    });

    assert.equal(res.status, 413);
    assert.equal(res.getHeader('access-control-allow-origin'), '*');
    assert.match(res.getHeader('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'Payload too large');

    // Verify subsequent valid request succeeds cleanly
    const nextRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ endpoint: 'GET /users/:id', path: 'user_name' }],
      },
    });
    assert.equal(nextRes.status, 200);
  });

  test('Strict boolean validation accepts boolean and missing strict, rejects non-booleans', async () => {
    // Missing strict defaults to false
    await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ endpoint: 'GET /users/:id', path: 'p_missing' }],
      },
    });

    // Boolean true
    await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        strict: true,
        reads: [{ endpoint: 'GET /users/:id', path: 'p_true' }],
      },
    });

    // Boolean false
    await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        strict: false,
        reads: [{ endpoint: 'GET /users/:id', path: 'p_false' }],
      },
    });

    const usageRes = await invokeHandler(handler, { method: 'GET', url: '/usage' });
    const usage = await usageRes.json();
    assert.equal(usage['GET /users/:id']['p_missing'][0].strict, false);
    assert.equal(usage['GET /users/:id']['p_true'][0].strict, true);
    assert.equal(usage['GET /users/:id']['p_false'][0].strict, false);

    // Non-boolean values must be rejected with 400
    const invalidStrictValues = ['false', 'true', null, 1, 0, {}, []];
    for (const val of invalidStrictValues) {
      const badRes = await invokeHandler(handler, {
        method: 'POST',
        url: '/reports',
        body: {
          client: 'web',
          version: '1',
          strict: val,
          reads: [{ endpoint: 'GET /users/:id', path: 'p_fail' }],
        },
      });
      assert.equal(badRes.status, 400, `strict value ${JSON.stringify(val)} should be rejected with 400`);
    }
  });

  test('Validates every read item and does not partially mutate usage map', async () => {
    // Missing endpoint
    const badEndpointRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ path: 'user_name' }],
      },
    });
    assert.equal(badEndpointRes.status, 400);

    // Empty endpoint
    const emptyEndpointRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ endpoint: '   ', path: 'user_name' }],
      },
    });
    assert.equal(emptyEndpointRes.status, 400);

    // Missing path
    const badPathRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ endpoint: 'GET /users/:id' }],
      },
    });
    assert.equal(badPathRes.status, 400);

    // Empty path
    const emptyPathRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [{ endpoint: 'GET /users/:id', path: '' }],
      },
    });
    assert.equal(emptyPathRes.status, 400);

    // Read item not an object
    const nonObjectReadRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: ['not-an-object'],
      },
    });
    assert.equal(nonObjectReadRes.status, 400);

    // Atomic test: invalid report must NOT partially mutate usage map
    const partialReportRes = await invokeHandler(handler, {
      method: 'POST',
      url: '/reports',
      body: {
        client: 'web',
        version: '1',
        reads: [
          { endpoint: 'GET /atomic-test', path: 'valid_field' },
          { endpoint: 'GET /atomic-test', path: '' }, // invalid!
        ],
      },
    });
    assert.equal(partialReportRes.status, 400);

    const checkUsageRes = await invokeHandler(handler, { method: 'GET', url: '/usage' });
    const currentUsage = await checkUsageRes.json();
    assert.equal(currentUsage['GET /atomic-test'], undefined, 'Usage map must not be partially mutated');
  });
});
