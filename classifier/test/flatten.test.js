import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { flattenShape } from '../src/flatten.js';

describe('flattenShape', () => {
  test('flattens simple primitives and nested objects', () => {
    const input = {
      user_name: 'alex_chen',
      email: 'alex@example.com',
      address: {
        city: 'Springfield',
        state: 'OR',
      },
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      user_name: 'string',
      email: 'string',
      'address.city': 'string',
      'address.state': 'string',
    });
  });

  test('flattens arrays of objects using orders[].total convention', () => {
    const input = {
      orders: [
        { id: 'ord-1', total: 89.99, active: true },
        { id: 'ord-2', total: 120.0 },
      ],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'orders[].id': 'string',
      'orders[].total': 'number',
      'orders[].active': 'boolean',
    });
  });

  test('flattens arrays of primitives', () => {
    const input = {
      tags: ['alpha', 'beta'],
      scores: [10, 20, 30],
      flags: [true, false],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'tags[]': 'string',
      'scores[]': 'number',
      'flags[]': 'boolean',
    });
  });

  test('flattens mixed primitive arrays using union representation', () => {
    const input = {
      mixed_scores: [95, 'absent', 87],
      nullable_values: [100, null],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'mixed_scores[]': 'number | string',
      'nullable_values[]': 'null | number',
    });
  });

  test('flattens mixed object and primitive arrays', () => {
    const input = {
      mixed_items: [{ id: 1, name: 'primary' }, 'fallback'],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'mixed_items[]': 'object | string',
      'mixed_items[].id': 'number',
      'mixed_items[].name': 'string',
    });
  });

  test('flattens empty arrays to unknown', () => {
    const input = {
      items: [],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'items[]': 'unknown',
    });
  });

  test('flattens null values correctly', () => {
    const input = {
      middle_name: null,
      address: {
        suite: null,
      },
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      middle_name: 'null',
      'address.suite': 'null',
    });
  });

  test('flattens nested arrays', () => {
    const input = {
      matrix: [[1, 2], [3, 4]],
    };

    const shape = flattenShape(input);
    assert.deepEqual(shape, {
      'matrix[][]': 'number',
    });
  });

  test('handles null and non-object root safely', () => {
    assert.deepEqual(flattenShape(null), {});
    assert.deepEqual(flattenShape(undefined), {});
    assert.deepEqual(flattenShape('hello'), {});
    assert.deepEqual(flattenShape(123), {});
  });
});
