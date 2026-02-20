<div align="center">

# 🏺 TEOS Risk Analyzer Bot (Telegram)

Telegram gateway for **TEOS MCP — Agent Code Risk MCP**.  
Paste code → get **ALLOW / WARN / BLOCK** decision + risk level.

</div>

---

## What This Is

This bot is a **Free Tier access layer** to the live TEOS MCP infrastructure.

- **5 free scans per Telegram account (lifetime)**
- After that, users continue on the web platform:
  - Pricing: https://app.teosegypt.com/pricing
  - Stats: https://app.teosegypt.com/stats

This bot is designed as an onboarding channel.  
Billing, subscriptions, and API access are managed on the main TEOS MCP platform.

---

## Monetization Roadmap

### Phase 1 — Free Tier + Pay-Per-Scan (Live)

- 5 free scans per Telegram account
- Pay-per-scan via MCP
- No subscription required
- Designed for developers and agents

### Phase 2 — Subscription Plans (Planned)

Upcoming additions on the TEOS MCP platform:

- Monthly subscriptions
- Yearly subscriptions (discounted)
- API key management
- Usage dashboard
- Team accounts
- CI/CD integration tiers

Telegram will remain a Free Tier funnel only.

---

## Recommended Pricing Structure

### Pay-Per-Scan (Agent Native)
- $0.25 — Basic scan
- $0.50 — Advanced scan
- $1.00 — Enterprise scan (policy + extended analysis)

### Subscription Plans (Phase 2)

| Plan        | Price        | Included Scans | Target User |
|------------|-------------|---------------|-------------|
| Developer  | $29/month   | 300 scans     | Solo builders |
| Pro        | $99/month   | 2,000 scans   | Teams |
| Business   | $299/month  | 10,000 scans  | CI/CD pipelines |
| Enterprise | Custom      | Unlimited     | Organizations |

Yearly plans: 20% discount recommended.

---

## Timeline Recommendation

**Week 1–2**
- Stabilize MCP
- Enable real signup + API keys
- Keep Telegram as Free Tier funnel

**Week 3–4**
- Launch subscription system
- Add Stripe monthly billing
- Add usage dashboard

**Month 2**
- Launch public subscription
- Introduce team plans
- Push Product Hunt / Hacker News

---

## Commands

- `/start` — start bot
- `/help` — usage guide
- `/scan <code>` — scan code
- paste code directly — scan without command
- `/balance` — show Free Tier usage
- `/pricing` — show pricing link
- `/ping` — check MCP server health

---

## Powered By

- TEOS MCP: https://app.teosegypt.com
- Organization-wide security & disclosure rules:
  https://github.com/Elmahrosa/.github/blob/main/SECURITY.md

---

## Deployment (Koyeb)

- Service type: Worker
- Builder: Dockerfile
- Instance: Nano
- Autoscaling: disabled (1 instance recommended)

If environment variables change → deploy without rebuild  
If code changes → deploy with rebuild

---

## Environment Variables

Required:
- `TG_TOKEN`
- `API_BASE_URL`
- `TEOS_BOT_KEY`
- `TEOS_OWNER_ID`

Optional:
- `FREE_SCANS`
- `RL_WINDOW_MS`
- `RL_MAX_REQ`
- `PAY_TO`
- `PRICE_SCAN_MIN`
- `PRICE_SCAN_MAX`

---

## Notes

- Telegram bot is a Free Tier gateway.
- Subscriptions will be added in Phase 2 on the web platform.
- Revenue from TEOS MCP supports long-term ecosystem development.
