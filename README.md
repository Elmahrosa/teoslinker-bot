 Below is a final production-ready README.md for your Telegram repo (Koyeb deploy + .env setup included).
It assumes your repo is teoslinker-bot and entrypoint is bot.js.

> ✅ It includes direct Koyeb env var setup (copy/paste), local .env, Docker, and quick test steps.



<div align="center">

# 🏺 TEOS Risk Analyzer Bot (TeosLinker)
Telegram interface for **Agent Code Risk MCP (TEOS MCP)**  
Paste code → Get **ALLOW / WARN / BLOCK** decision.

**Powered by:** https://app.teosegypt.com  
Built by **Elmahrosa** 🇪🇬 → global 🌍

</div>

---

## ✅ What This Bot Does

This bot is a **thin client** that calls TEOS MCP over HTTP and returns the MCP decision.

### Detects
- Prompt injection patterns
- Secret leaks
- Unsafe `eval()` / dynamic execution
- Agent autonomy risks
- Tool misuse patterns / dangerous primitives

### Business logic
- 🎁 **5 free scans** per Telegram user
- 💳 After limit: show payment instructions
- 👑 Founder bypass (owner ID)
- 🧾 Usage tracking per Telegram ID (simple JSON DB)

---

## 🔗 Live MCP Server

- **Status page / endpoints:** https://app.teosegypt.com  
- **Health:** `GET https://app.teosegypt.com/health`  
- **Analyze:** `POST https://app.teosegypt.com/analyze`

---

## 🤖 Bot Commands

- `/start` — welcome + remaining scans
- `/help` — usage guide
- `/scan <code>` — scan snippet
- paste code directly (no `/`) — also scans
- `/ping` — check API status
- `/balance` — view scans left
- `/pay` — payment instructions
- `/grant <telegramId>` — **admin only** manual unlock (until auto verification is added)

---

## 🧩 Requirements

- Node.js 18+ (recommended)
- Telegram bot token from **@BotFather**
- TEOS MCP server URL (ex: `https://app.teosegypt.com`)
- Internal bot bypass key (`TEOS_BOT_KEY`)
- (Optional) Docker for container deploy

---

## 🔐 Environment Variables

Create a local `.env` file OR set these in Koyeb:

| Variable | Example | Required |
|---|---|---|
| `TG_TOKEN` | `123:ABC...` | ✅ |
| `API_BASE_URL` | `https://app.teosegypt.com` | ✅ |
| `ANALYZE_PATH` | `/analyze` | ✅ |
| `TEOS_BOT_KEY` | `your_internal_key` | ✅ |
| `TEOS_OWNER_ID` | `123456789` | ✅ (for admin) |
| `PAY_TO` | `0x6CB8...566D` | optional |
| `PRICE_BASIC` | `0.25` | optional |

### `.env.example`
```env
TG_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
API_BASE_URL=https://app.teosegypt.com
ANALYZE_PATH=/analyze
TEOS_BOT_KEY=YOUR_INTERNAL_BOT_KEY
TEOS_OWNER_ID=123456789

PAY_TO=0x6CB857A62f6a55239D67C6bD1A8ed5671605566D
PRICE_BASIC=0.25


---

🧪 Run Locally

npm install
node bot.js

Test in Telegram:

1. Open your bot


2. Send: /scan eval(userInput)


3. Send: import { exec } from "child_process"; exec("ls")




---

🐳 Docker

Build

docker build -t teoslinker-bot .

Run

docker run --rm \
  -e TG_TOKEN="YOUR_TG_TOKEN" \
  -e API_BASE_URL="https://app.teosegypt.com" \
  -e ANALYZE_PATH="/analyze" \
  -e TEOS_BOT_KEY="YOUR_INTERNAL_KEY" \
  -e TEOS_OWNER_ID="123456789" \
  -e PAY_TO="0x6CB857A62f6a55239D67C6bD1A8ed5671605566D" \
  -e PRICE_BASIC="0.25" \
  teoslinker-bot


---

☁️ Deploy on Koyeb (Recommended)

1) Create the app

Koyeb → Create App

Source: GitHub

Select repo: teoslinker-bot

Build: Dockerfile (recommended) OR Node buildpack

Run command: node bot.js (if using Node buildpack)


2) Add Environment Variables in Koyeb

Koyeb → App → Settings → Environment Variables → Add these:

✅ Required:

TG_TOKEN = <your bot token>

API_BASE_URL = https://app.teosegypt.com

ANALYZE_PATH = /analyze

TEOS_BOT_KEY = <your internal bot key>

TEOS_OWNER_ID = <your telegram numeric id>


Optional:

PAY_TO = 0x6CB857A62f6a55239D67C6bD1A8ed5671605566D

PRICE_BASIC = 0.25


3) Deploy

Click Deploy.

4) Validate

Open Telegram and run:

/ping

/scan eval(userInput)



---

🔐 Security Notes (Important)

TEOS_BOT_KEY is a privileged bypass key — do not leak it

TEOS MCP should rate-limit requests and log:

x-teos-telegram-id

decision + risk


Payment verification is manual for now (/grant <telegramId>).
Auto verification can be added by checking on-chain USDC transfers on Base.



---

🗺 Roadmap

✅ Thin-client MCP integration

✅ Free-tier usage tracking

✅ Manual unlock for paid users

⏳ Auto on-chain payment verification (Base USDC)

⏳ Public “Try It” demo mode + rate limits

⏳ GitHub Action wrapper for CI/CD adoption



---

📩 Contact / Disclosure

Organization-wide security disclosure rules:
https://github.com/Elmahrosa/.github/blob/main/SECURITY.md

---

If you want, paste your **Dockerfile** here and I’ll ensure it matches Koyeb perfectly (entrypoint, port, node version, and persistence).0