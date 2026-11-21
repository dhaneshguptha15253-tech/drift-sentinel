/**
 * Flattens a nested JSON object into a map of dot-and-bracket paths to data types.
 *
 * Supported conventions:
 * - Nested objects: "address.city" -> "string"
 * - Arrays of objects: "orders[].total" -> "number"
 * - Arrays of primitives: "tags[]" -> "string"
 * - Empty arrays: "items[]" -> "unknown"
 * - Nested arrays: "matrix[][]" -> "number"
 * - Primitive types: "string", "number", "boolean", "null"
 *
 * @param {any} json - The JSON value to flatten.
 * @param {string} [prefix=''] - Optional path prefix.
 * @returns {Record<string, string>} Map of flattened paths to type strings.
 */
export function flattenShape(json, prefix = '') {
  if (json === null || typeof json !== 'object') {
    return {};
  }

  const result = {};

  function traverse(current, currentPath) {
    if (current === null) {
      if (currentPath) {
        result[currentPath] = 'null';
      }
      return;
    }

    if (Array.isArray(current)) {
      const arrayPath = currentPath ? `${currentPath}[]` : '[]';

      if (current.length === 0) {
        result[arrayPath] = 'unknown';
        return;
      }

      const objectElements = [];
      const arrayElements = [];
      const primitiveElements = [];

      for (const item of current) {
        if (item === null) {
          primitiveElements.push(null);
        } else if (Array.isArray(item)) {
          arrayElements.push(item);
        } else if (typeof item === 'object') {
          objectElements.push(item);
        } else {
          primitiveElements.push(item);
        }
      }

      // Handle array of objects
      if (objectElements.length > 0) {
        const allKeys = new Set();
        for (const obj of objectElements) {
          for (const key of Object.keys(obj)) {
            allKeys.add(key);
          }
        }

        for (const key of allKeys) {
          const sample = objectElements.find((obj) => obj[key] !== undefined)?.[key];
          traverse(sample, `${arrayPath}.${key}`);
        }
      }

      // Handle nested arrays
      if (arrayElements.length > 0) {
        traverse(arrayElements[0], arrayPath);
      }

      // Handle array of primitives and mixed elements
      if (primitiveElements.length > 0) {
        const typeSet = new Set();
        if (objectElements.length > 0) {
          typeSet.add('object');
        }
        if (arrayElements.length > 0) {
          typeSet.add('array');
        }
        for (const p of primitiveElements) {
          typeSet.add(p === null ? 'null' : typeof p);
        }
        result[arrayPath] = Array.from(typeSet).sort().join(' | ');
      }
      return;
    }

    if (typeof current === 'object') {
      const keys = Object.keys(current);
      if (keys.length === 0 && currentPath) {
        result[currentPath] = 'object';
        return;
      }

      for (const key of keys) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        const value = current[key];

        if (value === null) {
          result[nextPath] = 'null';
        } else if (Array.isArray(value)) {
          traverse(value, nextPath);
        } else if (typeof value === 'object') {
          traverse(value, nextPath);
        } else {
          result[nextPath] = typeof value;
        }
      }
      return;
    }

    if (currentPath) {
      result[currentPath] = typeof current;
    }
  }

  traverse(json, prefix);
  return result;
}
