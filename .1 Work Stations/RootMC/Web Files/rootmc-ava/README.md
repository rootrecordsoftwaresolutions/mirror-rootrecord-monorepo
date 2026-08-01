# Ava Ivy (`rootmc-ava`)

Discord bot for **Ava Ivy** — RootMC lead-dev + gamer girl.  
**Brain:** Cursor / Root Server only — **Grok/xAI unplugged**.

**Handoff / docs / uploads / plans:**  
`D:\.1 Work Stations\RootMC\Server Handoffs\Ava Ivy\`

## Run

```bat
cd "Web Files\rootmc-ava"
npm start
```

Status window: http://127.0.0.1:8787/  
`AVA_NO_STATUS_WINDOW=1` skips auto-open.

## Transport

- Default `AVA_TRANSPORT=both` — **Gateway** for live messages/DMs; REST poller for boot, reactions, poll watcher
- `AVA_TRANSPORT=gateway` — gateway + reaction/boot poll only
- `AVA_TRANSPORT=poller` — REST-only live answers (emergency)

## Behavior

- Boot: watermark catch-up → asleep apology if pings while away → live
- Instant ack → Root Server dig → one answer (hold beats if slow)
- First-contact **DM** onboarding once per player
- Attachments → `Ava Ivy/uploads/`; plans → `Ava Ivy/plans/`
- Features → proposal + vote gates; bugs → verify then fix
- Governance via `https://api.rootmc.net/api/governance/*`
- Job queue stage-only (no auto Shockbyte restart)
- Emergency stop: Alex / Melee (`emergency stop Ava`)
- Offline notes when Cursor key missing — **no Grok substitute**

## Env (RootMC `.env`)

| Key | Role |
|-----|------|
| `AVA_DISCORD_BOT_TOKEN` | Bot token |
| `AVA_DISCORD_APPLICATION_ID` | App id `1532751879875072070` |
| `CURSOR_API_KEY` | Root Server |
| `AVA_HANDOFF` | Handoff folder |
| `AVA_WATCH_CHANNELS` | Extra channel ids (csv) |
| `AVA_AUDIT_CHANNEL_ID` | Audit posts (default admins) |
| `AVA_OFFLINE_CHANNEL_ID` | Offline notes channel |
| `AVA_TRANSPORT` | `both` / `gateway` / `poller` |
| `AVA_MEMBER_ROLE_IDS` | Discord role ids → unlimited assists |
| `AVA_MELEE_DISCORD_ID` | Melee emergency-stop Discord id |
| `AVA_RCON_HOST` / `PASSWORD` / `PORT` | Guarded RCON |
| `AVA_ECOFLOW_ACCESS_KEY` / `SECRET_KEY` / `SN` | EcoFlow Open API (HMAC). `SN` comma-separated; buckets under handoff `data/ecoflow/` |
| `AVA_ECOFLOW_BASE_URL` | Default `https://api-a.ecoflow.com` (US). EU often `https://api-e.ecoflow.com` |
| `AVA_MOD_EXECUTE` | `1` = apply Discord timeouts on mute |
| `AVA_OFFLINE_CHANNEL_ID` | Offline notes channel |
| `AVA_AUDIT_CHANNEL_ID` | Audit posts |
| `AVA_CHANGELOG_CHANNEL_ID` | Ship/stage notes |

## HTTP

- `GET /` status window
- `GET /health` · `GET /api/status`
- `POST /v1/recommend` `{ "question", "context", "authorId" }`
