const banner = document.querySelector("#banner");
const out = document.querySelector("#out");
banner.textContent = "app.js started";

try {
  const { initTracker, track } = await import("../tracker/tracker.js");

  const params  = new URLSearchParams(location.search);
  const version = params.get("v") || "1";
  // ?strict=1 enables strict mode so the observer can warn on extra reads
  const strict  = params.get("strict") === "1";

  initTracker({
    client: "web",
    version,
    reportUrl: CONFIG.OBSERVER_URL ? CONFIG.OBSERVER_URL + "/reports" : "",
    flushMs: 2000,
    strict,          // passed through to every flush report
  });
  banner.textContent = "Web client v" + version + (strict ? " [strict]" : "");

  const res  = await fetch(CONFIG.API_URL);
  const user = track(await res.json(), "GET /users/:id");

  // Helper: render one list item; shows a red MISSING badge if value is undefined
  const row = (label, v) =>
    `<li>${label}: ${v === undefined ? '<span class="missing">MISSING</span>' : v}</li>`;

  out.innerHTML =
    version === "1"
      ? row("Name",        user.user_name)       +
        row("Email",       user.email)           +
        row("City",        user.address?.city)   +
        row("Order total", user.orders?.[0]?.total)
      : row("Email",  user.email)                +
        row("Plan",   user.plan)                 +
        row("Joined", user.joined_at)            +
        row("City",   user.address?.city);
} catch (err) {
  banner.textContent = "ERROR";
  out.innerHTML = '<li style="color:red">' + err.message + "</li>";
}
