# Account Hub — backend API proposals

These endpoints are **not implemented** in this scaffold; the frontend
calls them optimistically and degrades to a friendly "coming soon" toast
when the primary Worker returns 404.

Baseline: all new routes live on `https://api.rootrecord.info/api/...`
under the same Bearer-token auth as existing routes
(`/api/auth/login`, `/api/auth/me`, etc.).

## 1. Password change

```
POST /api/me/password
Authorization: Bearer <token>
{
  "current_password": "string",
  "new_password": "string"
}
→ 200 { ok: true }
→ 401 if current_password wrong
→ 422 if new_password fails policy
```

Rate-limit on the Worker: 5 attempts / 10 min / account.

## 2. Sessions (devices)

```
GET /api/me/sessions
→ 200 [{ id, device_id, user_agent, ip, created_at, last_seen_at, current: bool }, ...]

POST /api/me/sessions/:session_id/revoke
→ 200 { ok: true }

POST /api/auth/logout
{ "all_devices": true }
→ 200 { revoked: <count> }
```

## 3. Connected apps (server-driven)

```
GET /api/me/apps
→ 200 [
  {
    "id": "rootrecord_weather_manager_android",
    "name": "Weather Manager",
    "entitlement": "pro" | "free" | "life",
    "last_seen_at": "iso",
    "android_package": "com.rootrecord.weathermanager"
  },
  ...
]
```

Currently the Hub ships a curated `REGISTERED_APPS` list from
`src/lib/apps.js`. When this endpoint ships, replace that list with
`GET /api/me/apps` and keep icon/brand metadata client-side.

## 4. Email change (two-step)

```
POST /api/me/email/request { "new_email": "..." }
→ 202 (verification email sent)

POST /api/me/email/confirm { "token": "..." }
→ 200 { email: "new@..." }
```

## 5. Billing (already handled server-side via Stripe webhooks)

The Hub opens the existing hosted portal at
`https://rootrecord.info/account/billing` (new tab). We rely on
`POST /api/auth/entitlement` to refresh `pro_unlocked` / `life_member` /
`subscription_status` after the user returns.

## 6. Notification preferences (already live)

Uses the **existing** endpoints that Weather Manager already calls:

```
GET  /api/me/prefs
POST /api/me/prefs  { push_alerts, email_summary, device_activity, ... }
```

The Hub treats unknown keys as opaque and only read-modify-writes the
three keys it owns.
