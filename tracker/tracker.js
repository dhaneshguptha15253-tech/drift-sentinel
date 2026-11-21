const RAW = Symbol("raw");
let cfg = null;
const pending = new Map();

/**
 * initTracker({ client, version, reportUrl, strict, flushMs, onReport })
 *
 * onReport(result) is called after every successful or failed flush attempt:
 *   result.ok    – true if the POST succeeded (or no reportUrl was set)
 *   result.count – number of reads that were in this batch
 *   result.error – Error object when ok === false (undefined otherwise)
 */
export function initTracker({
  client,
  version,
  reportUrl = "",
  strict = false,
  flushMs = 5000,
  onReport = null,   // optional callback
}) {
  cfg = { client, version, reportUrl, strict, onReport };
  setInterval(flush, flushMs);
  if (typeof addEventListener === "function") addEventListener("pagehide", flush);
}

// Wrap API data so every field the app reads is recorded.
// endpointLabel example: "GET /users/:id"
export function track(data, endpointLabel) {
  return wrap(data, "", endpointLabel);
}

// Use raw() before JSON.stringify or spreading, so that is not counted as a read.
export function raw(x) {
  return (x && x[RAW]) || x;
}

export function _peek() {
  return [...pending.values()];
}

function wrap(obj, base, label) {
  if (obj === null || typeof obj !== "object") return obj;
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (prop === RAW) return target;
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      const value = Reflect.get(target, prop, receiver);
      if (!Object.prototype.hasOwnProperty.call(target, prop)) return value;

      if (Array.isArray(target)) {
        if (!/^\d+$/.test(prop)) return value; // length, map, etc.
        const path = `${base}[]`;
        if (value !== null && typeof value === "object") return wrap(value, path, label);
        record(label, path);
        return value;
      }

      const path = base ? `${base}.${prop}` : prop;
      record(label, path);
      return value !== null && typeof value === "object" ? wrap(value, path, label) : value;
    },
  });
}

function record(label, path) {
  pending.set(`${label}|${path}`, { endpoint: label, path });
}

export async function flush() {
  if (!cfg || pending.size === 0) return;
  const reads = [...pending.values()];
  pending.clear();
  const body = { client: cfg.client, version: cfg.version, strict: cfg.strict, reads };

  // No reportUrl – just log and call onReport with ok:true
  if (!cfg.reportUrl) {
    console.log("tracker report", JSON.stringify(body));
    cfg.onReport?.({ ok: true, count: reads.length });
    return;
  }

  try {
    await fetch(cfg.reportUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    cfg.onReport?.({ ok: true, count: reads.length });
  } catch (e) {
    reads.forEach((r) => record(r.endpoint, r.path)); // retry on the next flush
    cfg.onReport?.({ ok: false, count: reads.length, error: e });
  }
}
