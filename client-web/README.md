# Drift Sentinel – Web Client

Demo browser client that uses the tracker to record which fields each API
version reads.

---

## Running locally

Serve the **repo root** (not `client-web/`) so the ES module import path
`../tracker/tracker.js` resolves correctly.

```bash
# From the repo root
npx http-server . -p 3000 -c-1
```

Then open one of these URLs in your browser:

| URL | What you see |
|---|---|
| `http://localhost:3000/client-web/?v=1` | v1 layout – 8 fields |
| `http://localhost:3000/client-web/?v=2` | v2 layout – 8 fields |
| `http://localhost:3000/client-web/?v=1&strict=1` | v1 in **strict mode** (banner shows `[strict]`) |
| `http://localhost:3000/client-web/?v=1&debug=1` | v1 with **debug panel** (recorded paths + report status) |
| `http://localhost:3000/client-web/?v=1&api=https://api.example.com/users/1&observer=https://obs.example.com` | Live API + observer, no file edits needed |

> The `-c-1` flag disables http-server's cache so you always get fresh files.

---

## Query parameters

| Param | Values | Effect |
|---|---|---|
| `v` | `1` (default) or `2` | Selects which field set to render. |
| `strict` | `1` | Passes `strict: true` to `initTracker`; the observer uses this to warn on unexpected reads. |
| `debug` | `1` | Shows a debug panel listing recorded field paths and the last report delivery status. |
| `api` | any URL | Overrides `CONFIG.API_URL` from `config.js` without editing files. |
| `observer` | any URL | Overrides `CONFIG.OBSERVER_URL` from `config.js` without editing files. The tracker POSTs to `<observer>/reports`. |

---

## Fields read per version

See [FIELDS.md](FIELDS.md) for the full contract table (for teammate B).

**Quick summary:**

| Field | v1 | v2 |
|---|---|---|
| `user_name` | ✅ | — |
| `email` | ✅ | ✅ |
| `phone` | ✅ | — |
| `tier` | ✅ | — |
| `address.city` | ✅ | ✅ |
| `address.country` | ✅ | — |
| `address.zip` | — | ✅ |
| `orders[].id` | ✅ | — |
| `orders[].total` | ✅ | — |
| `orders[].status` | — | ✅ |
| `plan` | — | ✅ |
| `joined_at` | — | ✅ |
| `last_login` | — | ✅ |
| `org` | — | ✅ |

Fields not in the table (`legacy_flag`) are never read by either version.

---

## Mock data

`mock/user.json` is the local stand-in for the real API.  It contains all 14
fields so either layout renders without a live backend.

When you have a live API, pass it via `?api=<url>` or update `config.js`.

---

## Deploy

### GitHub Pages (static hosting, zero config)

1. Push the `tracker` branch to `main` (after PR merge).
2. Go to **Settings → Pages** in the GitHub repo.
3. Under *Build and deployment*, set source to **Deploy from a branch**, choose **`main`** and **`/ (root)`**.
4. Save.  GitHub builds in ~1 minute.

Your client is then live at:

```
https://dhaneshguptha15253-tech.github.io/drift-sentinel/client-web/index.html?v=1
```

Switch versions or environments with query params – no rebuild needed:

```
?v=2&strict=1
?v=1&api=https://api.example.com/users/42&observer=https://obs.example.com
```

> ⚠️ **Mixed-content warning**
>
> GitHub Pages serves over **https**.  If your demo API or observer runs over
> plain **http**, the browser will block the request (mixed content).
>
> Fix: make sure both `?api=` and `?observer=` point to **https** URLs.
> Example of a safe production call:
>
> ```
> https://dhaneshguptha15253-tech.github.io/drift-sentinel/client-web/index.html
>   ?v=1
>   &api=https://my-demo-api.onrender.com/users/1
>   &observer=https://my-observer.onrender.com
> ```
