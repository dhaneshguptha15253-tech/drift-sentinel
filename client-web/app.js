/**
 * client-web/app.js
 *
 * Query params accepted:
 *   ?v=1|2        — API version layout (default 1)
 *   ?strict=1     — pass strict:true to tracker
 *   ?debug=1      — show the debug panel (field paths + report status)
 *   ?api=<url>    — override CONFIG.API_URL
 *   ?observer=<url> — override CONFIG.OBSERVER_URL
 */

const banner  = document.querySelector("#banner");
const out     = document.querySelector("#out");
const dbgPanel = document.querySelector("#debug");
banner.textContent = "app.js started";

try {
  const { initTracker, track, _peek } = await import("../tracker/tracker.js");

  const params   = new URLSearchParams(location.search);
  const version  = params.get("v")        || "1";
  const strict   = params.get("strict")   === "1";
  const debug    = params.get("debug")    === "1";

  // ?api= and ?observer= override the defaults from config.js
  const apiUrl      = params.get("api")      || CONFIG.API_URL;
  const observerUrl = params.get("observer") || CONFIG.OBSERVER_URL;

  // Show debug panel if requested
  if (debug && dbgPanel) dbgPanel.hidden = false;

  // Track the last report result for the debug panel
  let lastReport = null;

  initTracker({
    client:    "web",
    version,
    reportUrl: observerUrl ? observerUrl + "/reports" : "",
    flushMs:   2000,
    strict,
    // onReport is called after every flush with { ok, count, error }
    onReport(result) {
      lastReport = result;
      refreshDebug();
    },
  });

  banner.textContent =
    "Web client v" + version +
    (strict ? " [strict]" : "") +
    (debug  ? " [debug]"  : "");

  const res  = await fetch(apiUrl);
  const user = track(await res.json(), "GET /users/:id");

  // Helper: render one list item; shows a red MISSING badge if value is undefined
  const row = (label, v) =>
    `<li>${label}: ${v === undefined ? '<span class="missing">MISSING</span>' : v}</li>`;

  if (version === "1") {
    // v1 reads: user_name, email, address.city, address.country,
    //           orders[].id, orders[].total, phone, tier
    out.innerHTML =
      row("Name",         user.user_name)             +
      row("Email",        user.email)                 +
      row("Phone",        user.phone)                 +
      row("Tier",         user.tier)                  +
      row("City",         user.address?.city)         +
      row("Country",      user.address?.country)      +
      row("Order #1 ID",  user.orders?.[0]?.id)       +
      row("Order total",  user.orders?.[0]?.total);
  } else {
    // v2 reads: email, plan, joined_at, last_login, org,
    //           address.city, address.zip, orders[].status
    out.innerHTML =
      row("Email",      user.email)                 +
      row("Plan",       user.plan)                  +
      row("Joined",     user.joined_at)             +
      row("Last login", user.last_login)            +
      row("Org",        user.org)                   +
      row("City",       user.address?.city)         +
      row("Zip",        user.address?.zip)          +
      row("Order status", user.orders?.[0]?.status);
  }

  // Initial debug panel render (before first flush)
  refreshDebug();

  // Keep debug panel live while the page is open
  function refreshDebug() {
    if (!debug || !dbgPanel) return;
    const paths   = _peek().map((r) => `<code>${r.path}</code>`).join(", ") || "(none yet)";
    const status  = lastReport === null
      ? "No report sent yet"
      : lastReport.ok
        ? `✅ Sent ${lastReport.count} read(s)`
        : `❌ Error: ${lastReport.error?.message || "unknown"}`;
    dbgPanel.innerHTML =
      `<strong>Tracker debug</strong><br>` +
      `<b>Recorded paths:</b> ${paths}<br>` +
      `<b>Report status:</b> ${status}`;
  }

} catch (err) {
  banner.textContent = "ERROR";
  out.innerHTML = '<li style="color:red">' + err.message + "</li>";
}
