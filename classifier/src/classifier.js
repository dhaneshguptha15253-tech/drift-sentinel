/**
 * Parses an explicit enum descriptor into an array of string variants.
 * Supports:
 * - Array-of-values: ['free', 'pro', 'enterprise']
 * - String notation: 'enum(free,pro)' or 'enum(free|pro)'
 * - Colon notation: 'enum:free,pro' or 'enum: free, pro'
 *
 * Returns null if the descriptor is not an explicit enum.
 *
 * @param {any} descriptor
 * @returns {string[] | null}
 */
export function parseEnumDescriptor(descriptor) {
  if (Array.isArray(descriptor)) {
    return descriptor.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof descriptor === 'string') {
    const trimmed = descriptor.trim();

    // Match enum(...)
    const parenMatch = trimmed.match(/^enum\s*\(([^)]+)\)$/i);
    if (parenMatch) {
      return parenMatch[1]
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Match enum:...
    const colonMatch = trimmed.match(/^enum\s*:\s*(.+)$/i);
    if (colonMatch) {
      return colonMatch[1]
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return null;
}

/**
 * Normalizes type descriptor for comparison.
 * If descriptor is an array, returns a sorted unique string representation.
 */
function normalizeType(type) {
  if (Array.isArray(type)) {
    return `enum(${[...new Set(type.map((v) => String(v).trim()))].sort().join(',')})`;
  }
  return String(type).trim();
}

/**
 * Formats a list of client reader records into deduplicated `${client} v${version}` strings.
 *
 * @param {Array<{ client: string, version: string, strict?: boolean }>} readers
 * @returns {string[]}
 */
function formatAffectedClients(readers) {
  if (!Array.isArray(readers) || readers.length === 0) {
    return [];
  }
  const clientSet = new Set();
  for (const r of readers) {
    if (r && typeof r.client === 'string' && typeof r.version === 'string') {
      clientSet.add(`${r.client.trim()} v${r.version.trim()}`);
    }
  }
  return Array.from(clientSet);
}

/**
 * Collects all unique clients with strict=true consuming a given endpoint.
 * Inspects all paths recorded under the endpoint in the usage map.
 *
 * @param {Record<string, any>} usageMap
 * @param {string} endpoint
 * @returns {string[]}
 */
function getStrictClientsForEndpoint(usageMap, endpoint) {
  const endpointReads = usageMap?.[endpoint] || {};
  const strictSet = new Set();

  for (const path of Object.keys(endpointReads)) {
    const readers = endpointReads[path];
    if (Array.isArray(readers)) {
      for (const r of readers) {
        if (r && r.strict === true && typeof r.client === 'string' && typeof r.version === 'string') {
          strictSet.add(`${r.client.trim()} v${r.version.trim()}`);
        }
      }
    }
  }

  return Array.from(strictSet);
}

/**
 * Compares old and new shapes for a single endpoint.
 *
 * @param {Record<string, any>} oldShape - Flattened paths and types for old API version.
 * @param {Record<string, any>} newShape - Flattened paths and types for new API version.
 * @param {Record<string, any>} usageMap - Observer usage map.
 * @param {string} endpoint - The endpoint string (e.g. "GET /users/:id").
 * @returns {Array<{ endpoint: string, path: string, changeType: string, verdict: string, affectedClients: string[] }>}
 */
function compareEndpointShapes(oldShape, newShape, usageMap, endpoint) {
  const changes = [];
  const oldPaths = new Set(Object.keys(oldShape || {}));
  const newPaths = new Set(Object.keys(newShape || {}));
  const endpointReads = usageMap?.[endpoint] || {};

  // 1. Check for removed and retyped fields
  for (const path of oldPaths) {
    const readers = endpointReads[path] || [];
    const affectedReaders = formatAffectedClients(readers);

    if (!newPaths.has(path)) {
      // Removed field
      changes.push({
        endpoint,
        path,
        changeType: 'removed',
        verdict: affectedReaders.length > 0 ? 'breaking' : 'safe',
        affectedClients: affectedReaders,
      });
      continue;
    }

    // Path exists in both old and new - check types
    const oldType = oldShape[path];
    const newType = newShape[path];

    const oldEnum = parseEnumDescriptor(oldType);
    const newEnum = parseEnumDescriptor(newType);

    if (oldEnum && newEnum) {
      // Both are enum descriptors: check for added and removed variants
      const addedVariants = newEnum.filter((v) => !oldEnum.includes(v));
      const removedVariants = oldEnum.filter((v) => !newEnum.includes(v));

      const hasAdded = addedVariants.length > 0;
      const hasRemoved = removedVariants.length > 0;

      if (hasAdded || hasRemoved) {
        let verdict = 'safe';
        if (affectedReaders.length > 0) {
          // If any variants were removed (or both added and removed), it's breaking.
          // If only variants were added, it's a warning.
          verdict = hasRemoved ? 'breaking' : 'warn';
        }

        changes.push({
          endpoint,
          path,
          changeType: 'enum_changed',
          verdict,
          affectedClients: affectedReaders,
        });
        continue;
      }

      // If variants are identical, skip
      continue;
    } else if (normalizeType(oldType) !== normalizeType(newType)) {
      // Standard retyped field
      changes.push({
        endpoint,
        path,
        changeType: 'retyped',
        verdict: affectedReaders.length > 0 ? 'breaking' : 'safe',
        affectedClients: affectedReaders,
      });
    }
  }

  // 2. Check for added fields
  for (const path of newPaths) {
    if (!oldPaths.has(path)) {
      const strictClients = getStrictClientsForEndpoint(usageMap, endpoint);
      changes.push({
        endpoint,
        path,
        changeType: 'added',
        verdict: strictClients.length > 0 ? 'breaking' : 'safe',
        affectedClients: strictClients,
      });
    }
  }

  return changes;
}

/**
 * Compares old and new shapes against the Observer usage map.
 * Supports both multi-endpoint shapes and single-endpoint flattened maps.
 *
 * Follows the check-result format specified in docs/formats.md Section 4:
 * [
 *   {
 *     "endpoint": "GET /users/:id",
 *     "path": "user_name",
 *     "changeType": "removed",
 *     "verdict": "breaking",
 *     "affectedClients": ["web v1"]
 *   }
 * ]
 *
 * @param {Record<string, any>} oldShape
 * @param {Record<string, any>} newShape
 * @param {Record<string, any>} usageMap
 * @param {string} [defaultEndpoint='GET /users/:id']
 * @returns {Array<{ endpoint: string, path: string, changeType: string, verdict: string, affectedClients: string[] }>}
 */
export function compareShapes(oldShape = {}, newShape = {}, usageMap = {}, defaultEndpoint = 'GET /users/:id') {
  // Determine if input is multi-endpoint (e.g. { "GET /users/:id": { ... } })
  const isMultiEndpoint = (shape) => {
    if (!shape || typeof shape !== 'object') return false;
    const values = Object.values(shape);
    return (
      values.length > 0 &&
      typeof values[0] === 'object' &&
      values[0] !== null &&
      !Array.isArray(values[0])
    );
  };

  if (isMultiEndpoint(oldShape) || isMultiEndpoint(newShape)) {
    const allEndpoints = new Set([
      ...Object.keys(oldShape || {}),
      ...Object.keys(newShape || {}),
    ]);
    const results = [];
    for (const ep of allEndpoints) {
      const oldEpShape = oldShape?.[ep] || {};
      const newEpShape = newShape?.[ep] || {};
      results.push(...compareEndpointShapes(oldEpShape, newEpShape, usageMap, ep));
    }
    return results;
  }

  return compareEndpointShapes(oldShape, newShape, usageMap, defaultEndpoint);
}
