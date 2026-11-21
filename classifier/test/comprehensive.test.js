import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenShape } from '../src/flatten.js';
import { compareShapes } from '../src/classifier.js';
import { getMockUser } from '../../demo-api/src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Validates that a change result adheres strictly to docs/formats.md Section 4:
 * {
 *   "endpoint": "GET /users/:id",
 *   "path": "user_name",
 *   "changeType": "removed",
 *   "verdict": "breaking",
 *   "affectedClients": ["web v1"]
 * }
 */
function assertValidCheckResult(record) {
  assert.ok(record && typeof record === 'object', 'Record must be an object');

  // Exact required properties only
  const allowedKeys = new Set(['endpoint', 'path', 'changeType', 'verdict', 'affectedClients']);
  const recordKeys = Object.keys(record);
  for (const key of recordKeys) {
    assert.ok(allowedKeys.has(key), `Unexpected property "${key}" in check result`);
  }

  assert.equal(typeof record.endpoint, 'string', 'endpoint must be a string');
  assert.ok(record.endpoint.trim().length > 0, 'endpoint must not be empty');

  assert.equal(typeof record.path, 'string', 'path must be a string');
  assert.ok(record.path.trim().length > 0, 'path must not be empty');

  const validChangeTypes = ['removed', 'retyped', 'added', 'enum_changed'];
  assert.ok(
    validChangeTypes.includes(record.changeType),
    `changeType "${record.changeType}" must be one of: ${validChangeTypes.join(', ')}`
  );

  const validVerdicts = ['breaking', 'warn', 'safe'];
  assert.ok(
    validVerdicts.includes(record.verdict),
    `verdict "${record.verdict}" must be one of: ${validVerdicts.join(', ')}`
  );

  assert.ok(Array.isArray(record.affectedClients), 'affectedClients must be an array');
  for (const clientStr of record.affectedClients) {
    assert.equal(typeof clientStr, 'string', 'Each affected client must be a string');
    assert.match(
      clientStr,
      /^[a-zA-Z0-9_.-]+\s+v[a-zA-Z0-9_.-]+$/,
      `affectedClient "${clientStr}" must match format "\${client} v\${version}"`
    );
  }
}

describe('Part 3 Comprehensive Classifier & Baseline Tests', () => {
  // Test 1: Explicit rename (old field removal + new field addition)
  test('1. Explicit rename: treated as removed + added with respective verdicts', () => {
    const oldShape = {
      user_name: 'string',
      email: 'string',
    };
    const newShape = {
      username: 'string', // renamed from user_name
      email: 'string',
    };

    const usageMap = {
      'GET /users/:id': {
        user_name: [{ client: 'web', version: '1', strict: false }],
        email: [{ client: 'mobile', version: '2.0', strict: true }],
      },
    };

    const results = compareShapes(oldShape, newShape, usageMap, 'GET /users/:id');

    // Rename must result in exactly 2 changes: removed user_name and added username
    assert.equal(results.length, 2);

    const removedChange = results.find((r) => r.path === 'user_name');
    assert.ok(removedChange, 'Must emit a removed record for old field name');
    assert.deepEqual(removedChange, {
      endpoint: 'GET /users/:id',
      path: 'user_name',
      changeType: 'removed',
      verdict: 'breaking',
      affectedClients: ['web v1'],
    });
    assertValidCheckResult(removedChange);

    const addedChange = results.find((r) => r.path === 'username');
    assert.ok(addedChange, 'Must emit an added record for new field name');
    assert.deepEqual(addedChange, {
      endpoint: 'GET /users/:id',
      path: 'username',
      changeType: 'added',
      verdict: 'breaking', // broken because mobile v2.0 is strict: true
      affectedClients: ['mobile v2.0'],
    });
    assertValidCheckResult(addedChange);
  });

  // Test 2: Mixed strict and non-strict clients
  test('2. Mixed strict and non-strict clients: only strict clients affected by new field', () => {
    const oldShape = {
      id: 'string',
    };
    const newShape = {
      id: 'string',
      country: 'string', // newly added
    };

    const usageMap = {
      'GET /users/:id': {
        id: [
          { client: 'web', version: '1', strict: false },
          { client: 'web', version: '2', strict: false },
          { client: 'mobile', version: '1.0', strict: true },
          { client: 'backend', version: '3.0', strict: true },
        ],
      },
    };

    const results = compareShapes(oldShape, newShape, usageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assertValidCheckResult(results[0]);

    assert.equal(results[0].changeType, 'added');
    assert.equal(results[0].verdict, 'breaking');
    // Only strict clients (mobile v1.0, backend v3.0) must be included
    assert.deepEqual(results[0].affectedClients.sort(), ['backend v3.0', 'mobile v1.0']);
    assert.ok(!results[0].affectedClients.includes('web v1'));
    assert.ok(!results[0].affectedClients.includes('web v2'));
  });

  // Test 3: Client deduplication when one client reads multiple paths
  test('3. Client deduplication when one client reads multiple paths', () => {
    const oldShape = {
      field_a: 'string',
      field_b: 'string',
      field_c: 'string',
    };
    const newShape = {
      field_a: 'string',
      field_b: 'string',
      field_c: 'string',
      field_new: 'string', // added
    };

    // web v1 reads 3 separate paths, all with strict: true
    const usageMap = {
      'GET /users/:id': {
        field_a: [{ client: 'web', version: '1', strict: true }],
        field_b: [{ client: 'web', version: '1', strict: true }],
        field_c: [{ client: 'web', version: '1', strict: true }],
      },
    };

    const results = compareShapes(oldShape, newShape, usageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assertValidCheckResult(results[0]);

    // Client must appear exactly once despite reading multiple paths
    assert.deepEqual(results[0].affectedClients, ['web v1']);
  });

  // Test 4: Empty usage map {}
  test('4. Empty usage map {}: all changes marked safe with empty affectedClients', () => {
    const oldShape = {
      field_removed: 'string',
      field_retyped: 'string',
      field_enum: ['active', 'pending'],
    };
    const newShape = {
      field_retyped: 'number',
      field_enum: ['active', 'pending', 'archived'],
      field_added: 'string',
    };

    const results = compareShapes(oldShape, newShape, {}, 'GET /users/:id');
    assert.equal(results.length, 4);

    for (const record of results) {
      assertValidCheckResult(record);
      assert.equal(record.verdict, 'safe', `Change on ${record.path} must be safe with empty usage map`);
      assert.deepEqual(record.affectedClients, [], `affectedClients for ${record.path} must be empty`);
    }
  });

  // Test 5: Null and undefined usage maps
  test('5. Null and undefined usage maps: safe execution without exceptions', () => {
    const oldShape = { a: 'string' };
    const newShape = { a: 'number', b: 'string' };

    // Test with null
    const nullResults = compareShapes(oldShape, newShape, null, 'GET /users/:id');
    assert.equal(nullResults.length, 2);
    for (const r of nullResults) {
      assertValidCheckResult(r);
      assert.equal(r.verdict, 'safe');
      assert.deepEqual(r.affectedClients, []);
    }

    // Test with undefined
    const undefResults = compareShapes(oldShape, newShape, undefined, 'GET /users/:id');
    assert.equal(undefResults.length, 2);
    for (const r of undefResults) {
      assertValidCheckResult(r);
      assert.equal(r.verdict, 'safe');
      assert.deepEqual(r.affectedClients, []);
    }
  });

  // Test 6: Identical shapes produce an empty result
  test('6. Identical shapes produce an empty result', () => {
    const shape = {
      user_name: 'string',
      'address.city': 'string',
      'orders[].total': 'number',
      plan: ['free', 'pro'],
    };

    const results = compareShapes(shape, structuredClone(shape), {}, 'GET /users/:id');
    assert.deepEqual(results, []);
  });

  // Test 7: Equivalent enum descriptors with different ordering and syntax
  test('7. Equivalent enum descriptors with different ordering/syntax produce no change', () => {
    const oldShape = {
      plan_a: ['free', 'pro', 'enterprise'],
      plan_b: 'enum(free, pro, enterprise)',
      plan_c: 'enum: free, pro, enterprise',
    };
    const newShape = {
      plan_a: 'enum(enterprise, pro, free)', // different syntax & order
      plan_b: ['enterprise', 'free', 'pro'],  // different syntax & order
      plan_c: 'enum(free|pro|enterprise)',    // pipe syntax
    };

    const usageMap = {
      'GET /users/:id': {
        plan_a: [{ client: 'web', version: '1', strict: false }],
        plan_b: [{ client: 'web', version: '1', strict: false }],
        plan_c: [{ client: 'web', version: '1', strict: false }],
      },
    };

    const results = compareShapes(oldShape, newShape, usageMap, 'GET /users/:id');
    assert.deepEqual(results, [], 'Equivalent enum variants must produce no diff');
  });

  // Test 8: Arrays of objects with disjoint keys
  test('8. Arrays of objects with disjoint keys: discover properties from every element', () => {
    const input = {
      items: [
        { id: 1, sku: 'A1' },
        { id: 2, description: 'Widget', active: true },
        { id: 3, tags: ['promo'], meta: { score: 10 } },
      ],
    };

    const flattened = flattenShape(input);
    assert.deepEqual(flattened, {
      'items[].id': 'number',
      'items[].sku': 'string',
      'items[].description': 'string',
      'items[].active': 'boolean',
      'items[].tags[]': 'string',
      'items[].meta.score': 'number',
    });
  });

  // Test 9: Multiple endpoints with breaking, warn, and safe outcomes in one comparison
  test('9. Multiple endpoints with breaking, warn, and safe outcomes in one comparison', () => {
    const oldShapes = {
      'GET /users/:id': {
        user_name: 'string', // will be removed (breaking)
      },
      'GET /products/:id': {
        tier: ['standard', 'premium'], // will add variant (warn)
      },
      'GET /health': {
        status: 'string', // will add new field without strict clients (safe)
      },
    };

    const newShapes = {
      'GET /users/:id': {},
      'GET /products/:id': {
        tier: ['standard', 'premium', 'ultra'],
      },
      'GET /health': {
        status: 'string',
        version: 'string',
      },
    };

    const usageMap = {
      'GET /users/:id': {
        user_name: [{ client: 'web', version: '1', strict: false }],
      },
      'GET /products/:id': {
        tier: [{ client: 'web', version: '1', strict: false }],
      },
      'GET /health': {
        status: [{ client: 'monitor', version: '1.0', strict: false }], // not strict
      },
    };

    const results = compareShapes(oldShapes, newShapes, usageMap);
    assert.equal(results.length, 3);

    for (const r of results) {
      assertValidCheckResult(r);
    }

    const usersDiff = results.find((r) => r.endpoint === 'GET /users/:id');
    assert.deepEqual(usersDiff, {
      endpoint: 'GET /users/:id',
      path: 'user_name',
      changeType: 'removed',
      verdict: 'breaking',
      affectedClients: ['web v1'],
    });

    const productsDiff = results.find((r) => r.endpoint === 'GET /products/:id');
    assert.deepEqual(productsDiff, {
      endpoint: 'GET /products/:id',
      path: 'tier',
      changeType: 'enum_changed',
      verdict: 'warn',
      affectedClients: ['web v1'],
    });

    const healthDiff = results.find((r) => r.endpoint === 'GET /health');
    assert.deepEqual(healthDiff, {
      endpoint: 'GET /health',
      path: 'version',
      changeType: 'added',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  // Test 10: Exact output schema validation
  test('10. Exact output schema validation for all change types and verdicts', () => {
    const oldShape = {
      removed_f: 'string',
      retyped_f: 'string',
      enum_f: ['a', 'b'],
    };
    const newShape = {
      retyped_f: 'number',
      enum_f: ['a', 'b', 'c'],
      added_f: 'boolean',
    };

    const usageMap = {
      'GET /users/:id': {
        removed_f: [{ client: 'web', version: '1', strict: false }],
        retyped_f: [{ client: 'ios', version: '2.1', strict: false }],
        enum_f: [{ client: 'web', version: '1', strict: false }],
        other: [{ client: 'android', version: '1.0', strict: true }],
      },
    };

    const results = compareShapes(oldShape, newShape, usageMap, 'GET /users/:id');
    assert.equal(results.length, 4);

    for (const r of results) {
      assertValidCheckResult(r);
    }
  });

  // Test 11: Baseline shapes verification
  test('11. baseline-shapes.json matches actual Demo API flattened shape', () => {
    const baselinePath = path.join(ROOT_DIR, 'baseline-shapes.json');
    assert.ok(fs.existsSync(baselinePath), 'baseline-shapes.json must exist at repository root');

    const rawContent = fs.readFileSync(baselinePath, 'utf8');
    const baseline = JSON.parse(rawContent);

    // Compute live flattened shape from Demo API
    const user = getMockUser('1');
    const liveFlattened = flattenShape(user);

    assert.ok(baseline['GET /users/:id'], 'baseline must contain "GET /users/:id"');
    assert.deepEqual(baseline['GET /users/:id'], liveFlattened);

    // Verify key contract fields
    assert.equal(baseline['GET /users/:id'].user_name, 'string');
    assert.equal(baseline['GET /users/:id']['address.city'], 'string');
    assert.equal(baseline['GET /users/:id']['orders[].total'], 'number');
    assert.equal(baseline['GET /users/:id'].plan, 'string');
    assert.equal(baseline['GET /users/:id'].joined_at, 'string');
    assert.equal(baseline['GET /users/:id'].legacy_flag, 'boolean');
  });
});
