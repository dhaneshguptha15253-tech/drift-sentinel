# Drift Sentinel – Fields Reference

This table is the **contract** between the web client and the demo API
(Person B).  The API **must** return all ticked fields for each version;
any missing field shows as a red **MISSING** badge in the client.

## Field → Version matrix

| Field | JSON path | v1 | v2 | Notes |
|---|---|:---:|:---:|---|
| Name | `user_name` | ✅ | — | |
| Email | `email` | ✅ | ✅ | read by both versions |
| Phone | `phone` | ✅ | — | |
| Tier | `tier` | ✅ | — | e.g. `"gold"` |
| City | `address.city` | ✅ | ✅ | nested object |
| Country | `address.country` | ✅ | — | nested object |
| Zip | `address.zip` | — | ✅ | nested object |
| Order ID | `orders[].id` | ✅ | — | array element |
| Order total | `orders[].total` | ✅ | — | array element |
| Order status | `orders[].status` | — | ✅ | array element |
| Plan | `plan` | — | ✅ | |
| Joined | `joined_at` | — | ✅ | ISO 8601 date |
| Last login | `last_login` | — | ✅ | ISO 8601 datetime |
| Org | `org` | — | ✅ | |
| Legacy flag | `legacy_flag` | — | — | present in mock, never read |

## Summary

- **v1 reads 8 fields:** `user_name`, `email`, `phone`, `tier`, `address.city`, `address.country`, `orders[].id`, `orders[].total`
- **v2 reads 8 fields:** `email`, `plan`, `joined_at`, `last_login`, `org`, `address.city`, `address.zip`, `orders[].status`
- **Overlap:** `email`, `address.city`
- **Never read:** `legacy_flag` (present in mock/API for forward-compat testing)

## Mock superset (`mock/user.json`)

The local mock contains all 14 fields above so both layouts render without
a live API.  When the real API is wired up via `?api=<url>`, it only needs
to return the fields its version requires.
