

# 🏺 TEOS Linker Bot

Telegram gateway for **TEOS MCP — Agent Code Risk Scanner**

This bot allows developers to scan code directly from Telegram using the live TEOS MCP engine.

It acts as a secure gateway between Telegram users and the production MCP server.

---

## 🚀 Live System Architecture

Telegram User  
↓  
TEOS Linker Bot (Koyeb Worker)  
↓  
TEOS MCP Server  
↓  
Decision Engine + Governance Layer  

---

## 🔎 What It Detects

- Prompt injection risks
- Secret/API key leakage
- Unsafe `eval()` / dynamic execution
- Agent autonomy abuse
- Tool misuse patterns
- Governance violations

---

## 🎁 Free Tier

- Default: 5 free scans
- Rate limited (2 min cooldown)
- Paid unlock for unlimited scans

---

## 🔐 Security Features

- Shared secret header (`x-teos-bot-key`)
- Per-user rate limiting
- Free-tier enforcement
- Owner bypass control
- Timeout-protected MCP calls
- No secret logging

---

## 📦 Environment Variables (Koyeb)

Required:

TG_TOKEN API_BASE_URL TEOS_BOT_KEY

Optional / Configurable:

ANALYZE_PATH=/analyze HEALTH_PATH=/health FREE_SCANS=5 RATE_LIMIT_SECONDS=120 PRICE_BASIC=0.25 PAY_TO=0x6CB857A62f6a55239D67C6bD1A8ed5671605566D TEOS_OWNER_ID=YOUR_TELEGRAM_ID

---

## 🛠 Deployment (Koyeb)

- Service Type: Worker
- Builder: Dockerfile
- Instance: Nano (0.25 vCPU / 256MB RAM)
- Region: EU (Paris or Frankfurt)
- Scaling: Fixed (1 instance)

After changing environment variables:
→ Use **Without rebuild**

After changing code:
→ Use **With build**

---

## 🧠 Usage

Start bot:

/start

Scan code:

/scan eval(userInput)

Or paste any code directly.

Check status:

/balance

Check API:

/ping

---

## ⚠️ Notes

Filesystem storage uses `data.json`.  
For production persistence, attach a Koyeb Volume or migrate to SQLite.

---

## 🔗 Powered by

TEOS MCP  
https://app.teosegypt.com

---

© Elmahrosa — Sovereign Agent Governance


---

✅ Your 8 Environment Variables (Final List)

In Koyeb → Settings → Environment Variables

Add exactly these:

TG_TOKEN=your_real_telegram_token
API_BASE_URL=https://app.teosegypt.com
TEOS_BOT_KEY=long_random_shared_secret_32+chars
ANALYZE_PATH=/analyze
HEALTH_PATH=/health
FREE_SCANS=5
RATE_LIMIT_SECONDS=120
TEOS_OWNER_ID=8229874922

Optional monetization vars:

PRICE_BASIC=0.25
PAY_TO=0x6CB857A62f6a55239D67C6bD1A8ed5671605566D


---
