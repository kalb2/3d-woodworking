# workbench-sync Worker

Cloudflare Worker (`src/sync/worker.ts`, config in this folder) that serves `/api/v1` against the D1 database `workbench`. See `docs/account-sync.md` for routes, Sign in with Apple, and how device builds find this origin.

## Login rate limits

Guessing surfaces use a **15-minute sliding window** stored in D1 (`auth_attempts`). No Durable Objects and no paid rate-limit product. The Worker keys on `CF-Connecting-IP` (then the first `X-Forwarded-For` hop) and, for password login, on the normalized username.

| Surface | What counts | Limit |
| --- | --- | --- |
| `POST /auth/login` | Failed attempts (wrong username or password) | 8 per username / 15 min, and 30 per IP / 15 min |
| `POST /auth/signup` | Each attempt that passed username/password format checks (created or taken) | 10 per IP / 15 min |
| `POST /auth/apple` | Rejected identity tokens (`401`) | 20 per IP / 15 min |

Over the limit the route returns **429** with `Retry-After` (seconds until the oldest attempt in the window expires) and the generic body `{ "error": "Too many attempts. Try again later." }`. It does not say whether the username exists.

A successful password login clears that username’s failure count so a few typos do not stick after the right password. The IP bucket is left as-is (it is shared). Valid logins under the cap have the same token/account response as before.

Malformed JSON or invalid username/password format still return `400` and are not counted.

The Vite dev server uses an in-memory copy of the same counters (reset when the dev process restarts).

## Schema

Fresh databases: `schema.sql` (includes `auth_attempts`). Existing remote D1: apply `migrations/0001_auth_attempts.sql` (see the deploy checklist in the PR that added it). Do not put secrets in this folder.
