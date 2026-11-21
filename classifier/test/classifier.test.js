import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareShapes, parseEnumDescriptor } from '../src/classifier.js';

describe('compareShapes', () => {
  const sampleUsageMap = {
    'GET /users/:id': {
      user_name: [{ client: 'web', version: '1', strict: false }],
      email: [
        { client: 'web', version: '1', strict: false },
        { client: 'web', version: '2', strict: false },
      ],
      plan: [{ client: 'mobile', version: '1.0', strict: true }],
    },
  };

  test('parseEnumDescriptor handles array and string notations', () => {
    assert.deepEqual(parseEnumDescriptor(['free', 'pro']), ['free', 'pro']);
    assert.deepEqual(parseEnumDescriptor('enum(free,pro)'), ['free', 'pro']);
    assert.deepEqual(parseEnumDescriptor('enum(free|pro|enterprise)'), ['free', 'pro', 'enterprise']);
    assert.deepEqual(parseEnumDescriptor('enum: free, pro'), ['free', 'pro']);
    assert.equal(parseEnumDescriptor('string'), null);
    assert.equal(parseEnumDescriptor(123), null);
  });

  test('Removed field: breaking when path has readers', () => {
    const oldShape = {
      user_name: 'string',
      address: 'string',
    };
    const newShape = {
      address: 'string',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'user_name',
      changeType: 'removed',
      verdict: 'breaking',
      affectedClients: ['web v1'],
    });
  });

  test('Removed field: safe when path has no readers', () => {
    const oldShape = {
      legacy_unused: 'string',
      address: 'string',
    };
    const newShape = {
      address: 'string',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'legacy_unused',
      changeType: 'removed',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Retyped field: breaking when path has readers', () => {
    const oldShape = {
      email: 'string',
    };
    const newShape = {
      email: 'number',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'email',
      changeType: 'retyped',
      verdict: 'breaking',
      affectedClients: ['web v1', 'web v2'],
    });
  });

  test('Retyped field: safe when path has no readers', () => {
    const oldShape = {
      internal_code: 'string',
    };
    const newShape = {
      internal_code: 'number',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'internal_code',
      changeType: 'retyped',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Added field: breaking when endpoint has strict clients', () => {
    const oldShape = {
      user_name: 'string',
    };
    const newShape = {
      user_name: 'string',
      new_optional_field: 'string',
    };

    // sampleUsageMap has mobile v1.0 with strict: true on GET /users/:id
    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'new_optional_field',
      changeType: 'added',
      verdict: 'breaking',
      affectedClients: ['mobile v1.0'],
    });
  });

  test('Added field: safe when endpoint has no strict clients', () => {
    const usageMapNoStrict = {
      'GET /orders/:id': {
        order_total: [{ client: 'web', version: '1', strict: false }],
      },
    };

    const oldShape = {
      order_total: 'number',
    };
    const newShape = {
      order_total: 'number',
      notes: 'string',
    };

    const results = compareShapes(oldShape, newShape, usageMapNoStrict, 'GET /orders/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /orders/:id',
      path: 'notes',
      changeType: 'added',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Enum changed: warn when path has readers', () => {
    const oldShape = {
      email: ['standard', 'work'],
    };
    const newShape = {
      email: ['standard', 'work', 'alias'],
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'email',
      changeType: 'enum_changed',
      verdict: 'warn',
      affectedClients: ['web v1', 'web v2'],
    });
  });

  test('Enum changed with string notation: safe when no readers', () => {
    const oldShape = {
      account_status: 'enum(active,pending)',
    };
    const newShape = {
      account_status: 'enum(active,pending,suspended)',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'account_status',
      changeType: 'enum_changed',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Enum values removed: breaking when path has readers', () => {
    const oldShape = {
      plan: ['free', 'pro', 'enterprise'],
    };
    const newShape = {
      plan: ['free', 'pro'],
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'plan',
      changeType: 'enum_changed',
      verdict: 'breaking',
      affectedClients: ['mobile v1.0'],
    });
  });

  test('Enum values removed: safe when path has no readers', () => {
    const oldShape = {
      unused_status: 'enum: active, inactive, archived',
    };
    const newShape = {
      unused_status: 'enum: active, inactive',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'unused_status',
      changeType: 'enum_changed',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Enum with both additions and removals: breaking when path has readers', () => {
    const oldShape = {
      plan: ['free', 'pro'],
    };
    const newShape = {
      plan: ['free', 'enterprise'], // 'pro' removed, 'enterprise' added
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'plan',
      changeType: 'enum_changed',
      verdict: 'breaking',
      affectedClients: ['mobile v1.0'],
    });
  });

  test('Enum with both additions and removals: safe when path has no readers', () => {
    const oldShape = {
      tier: 'enum(a, b)',
    };
    const newShape = {
      tier: 'enum(a, c)',
    };

    const results = compareShapes(oldShape, newShape, sampleUsageMap, 'GET /users/:id');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      endpoint: 'GET /users/:id',
      path: 'tier',
      changeType: 'enum_changed',
      verdict: 'safe',
      affectedClients: [],
    });
  });

  test('Multi-endpoint comparison across multiple endpoints', () => {
    const oldShapes = {
      'GET /users/:id': {
        user_name: 'string',
      },
      'GET /orders/:id': {
        order_id: 'string',
      },
    };

    const newShapes = {
      'GET /users/:id': {
        user_name: 'number', // retyped
      },
      'GET /orders/:id': {
        // removed order_id
      },
    };

    const results = compareShapes(oldShapes, newShapes, sampleUsageMap);
    assert.equal(results.length, 2);

    const userChange = results.find((r) => r.endpoint === 'GET /users/:id');
    assert.deepEqual(userChange, {
      endpoint: 'GET /users/:id',
      path: 'user_name',
      changeType: 'retyped',
      verdict: 'breaking',
      affectedClients: ['web v1'],
    });

    const orderChange = results.find((r) => r.endpoint === 'GET /orders/:id');
    assert.deepEqual(orderChange, {
      endpoint: 'GET /orders/:id',
      path: 'order_id',
      changeType: 'removed',
      verdict: 'safe',
      affectedClients: [],
    });
  });
});
