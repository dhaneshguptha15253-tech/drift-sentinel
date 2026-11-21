/**
 * UsageStore holds and manages the runtime usage map.
 * Format strictly conforms to docs/formats.md:
 * {
 *   "GET /users/:id": {
 *     "user_name": [ { "client": "web", "version": "1", "strict": false } ],
 *     "email": [
 *       { "client": "web", "version": "1", "strict": false },
 *       { "client": "web", "version": "2", "strict": false }
 *     ]
 *   }
 * }
 */
export class UsageStore {
  constructor(initialData = {}) {
    this.usage = structuredClone(initialData);
  }

  /**
   * Returns a deep clone of the current usage map.
   */
  getUsage() {
    return structuredClone(this.usage);
  }

  /**
   * Merges incoming report reads into the usage map.
   * Preserves existing entries and prevents duplicate identical entries.
   *
   * @param {Object} report
   * @param {string} report.client
   * @param {string} report.version
   * @param {boolean} [report.strict=false]
   * @param {Array<{ endpoint: string, path: string }>} report.reads
   */
  recordReport(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      throw new Error('Report payload must be a non-null object');
    }

    const { client, version, reads } = report;

    if (typeof client !== 'string' || !client.trim()) {
      throw new Error('Field "client" is required and must be a non-empty string');
    }

    if (typeof version !== 'string' || !version.trim()) {
      throw new Error('Field "version" is required and must be a non-empty string');
    }

    // Fix 3: Strict boolean validation
    let strict = false;
    if ('strict' in report && report.strict !== undefined) {
      if (typeof report.strict !== 'boolean') {
        throw new Error('Field "strict" must be a boolean when provided');
      }
      strict = report.strict;
    }

    if (!Array.isArray(reads)) {
      throw new Error('Field "reads" is required and must be an array');
    }

    // Fix 4: Validate every read item before mutating the usage map
    const validatedReads = [];
    for (let i = 0; i < reads.length; i++) {
      const item = reads[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`Read item at index ${i} must be a non-null object`);
      }

      const { endpoint, path } = item;
      if (typeof endpoint !== 'string' || !endpoint.trim()) {
        throw new Error(`Read item at index ${i} must contain a non-empty string "endpoint"`);
      }
      if (typeof path !== 'string' || !path.trim()) {
        throw new Error(`Read item at index ${i} must contain a non-empty string "path"`);
      }

      validatedReads.push({
        endpoint: endpoint.trim(),
        path: path.trim(),
      });
    }

    // Phase 2: Mutation (only reached if all items and fields are valid)
    const clientEntry = {
      client: client.trim(),
      version: version.trim(),
      strict,
    };

    for (const { endpoint: ep, path: p } of validatedReads) {
      if (!this.usage[ep]) {
        this.usage[ep] = {};
      }

      if (!this.usage[ep][p]) {
        this.usage[ep][p] = [];
      }

      const existingEntries = this.usage[ep][p];
      const isDuplicate = existingEntries.some(
        (entry) =>
          entry.client === clientEntry.client &&
          entry.version === clientEntry.version &&
          entry.strict === clientEntry.strict
      );

      if (!isDuplicate) {
        existingEntries.push({ ...clientEntry });
      }
    }

    return this.getUsage();
  }

  /**
   * Clears all recorded usage entries.
   */
  clear() {
    this.usage = {};
  }
}

export const defaultStore = new UsageStore();
