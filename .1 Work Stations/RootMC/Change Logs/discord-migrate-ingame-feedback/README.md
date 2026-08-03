# In-game /feedback → Slack (migrated)

Canonical: Slack `#feedback` (`C0BLMGBVAMD`)
Webhook secret: `SLACK_FEEDBACK_WEBHOOK_URL` on Worker `rootmc-api`

Legacy Discord: `#ingame-feedback` (`1516828735536365669`) — no new posts; messages not copied (already caught up).

Also routes here:
- POST `/api/rootmc/ingame-feedback`
- POST `/api/rootmc/ingame-questionnaire`
- POST `/api/rootmc/command-test-report`

Setup: `powershell -File scripts\setup-slack-feedback.ps1 -WebhookUrl "https://hooks.slack.com/services/..." -Deploy`

Migrated: 2026-07-30
