# 🔗 TeosLinker

> On-chain risk monitoring + execution guard for autonomous AI agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue.svg)](https://t.me/teoslinker)
[![Part of TeosMCP](https://img.shields.io/badge/TeosMCP-Ecosystem-orange.svg)](https://github.com/Elmahrosa/agent-code-risk-mcp/blob/main/TEOS_ECOSYSTEM.md)

---

## What Is This?

Your agent is about to execute an on-chain transaction.
**But is the chain state safe right now?**

TeosLinker watches the blockchain and tells your agent:
- ✅ **ALLOW** — conditions are safe, proceed
- 🚫 **BLOCK** — anomaly detected, stop and alert

Real-time. Deterministic. Agent-native.

---

## Features

| Feature | Description |
|---------|-------------|
| 🔍 Contract monitoring | Watch any contract for state changes |
| 💧 Liquidity alerts | Alert when liquidity drops below threshold |
| 📊 Price deviation | Block execution if price moves too far |
| ⚡ MEV detection | Detect sandwich attacks before they happen |
| 🤖 MCP interface | Native tool for AI agent pipelines |
| 📱 Telegram alerts | Real-time notifications to your phone |

---

## Quick Start

### Option A: Telegram Bot (Easiest)

1. Open Telegram → search `@TeosLinkerBot`
2. Send `/start`
3. Add a contract: `/watch 0xYourContract`
4. Get alerts when anomalies are detected

### Option B: Self-hosted

```bash
git clone https://github.com/Elmahrosa/teoslinker-bot
cd teoslinker-bot
cp .env.example .env
# Fill in your RPC URL and Telegram bot token
npm install
npm start
```

### Option C: Docker

```bash
docker build -t teoslinker .
docker run -e TELEGRAM_BOT_TOKEN=xxx -e RPC_URL=xxx teoslinker
```

---

## MCP Tools

### `check_alert_threshold`

Query current chain safety before your agent acts.

**Input:**
```json
{
  "contract": "0x...",
  "condition": "liquidity | price | state",
  "threshold": 0.05
}
```

**Output:**
```json
{
  "verdict": "ALLOW | BLOCK",
  "current_value": 0.03,
  "threshold": 0.05,
  "reasoning": "Liquidity within normal range",
  "timestamp": "2026-02-23T06:40:00Z"
}
```

---

## What TeosLinker Detects

| Risk Type | Description |
|-----------|-------------|
| 💧 Liquidity drain | Sudden drop in pool liquidity |
| 📉 Price manipulation | Abnormal price movement |
| 🥪 MEV / Sandwich | Front-running detection |
| 🚨 Rug pull signals | Large owner withdrawals |
| ⏸️ Contract pause | Protocol emergency stops |
| 🔄 State anomaly | Unexpected contract state changes |

---

## Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
RPC_URL_ETHEREUM=https://mainnet.infura.io/v3/YOUR_KEY

# Optional
RPC_URL_BASE=https://mainnet.base.org
RPC_URL_ARBITRUM=https://arb1.arbitrum.io/rpc
PORT=3000
```

---

## Use Cases

- **Trading agents** — Check market conditions before every trade
- **Yield farming bots** — Detect liquidity shifts before they hurt you
- **DAO executors** — Validate chain state before executing proposals
- **DeFi monitoring** — 24/7 watch on your protocol

---

## Pricing

| Plan | Contracts | Alerts/month | Price |
|------|-----------|--------------|-------|
| Free | 3 | 1,000 | $0 |
| Pro | 50 | 100,000 | $99/month |
| Enterprise | Unlimited | Unlimited | $2,000+/month |

---

## Part of TeosMCP Ecosystem

TeosLinker is the **on-chain safety layer** of TeosMCP.

```
CodeGuard MCP  → checks CODE risk before execution
TeosLinker     → checks ON-CHAIN risk before execution
TeosMCP Core   → combines both: one ALLOW/BLOCK verdict
```

➡️ See [TEOS_ECOSYSTEM.md](./TEOS_ECOSYSTEM.md) for full architecture.

---

## Contributing

1. Fork this repo
2. `git checkout -b feature/your-feature`
3. Make changes + add tests
4. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Contact

- 🐦 X: [@king_teos](https://x.com/king_teos)
- 🤖 Telegram: [@TeosLinkerBot]([https://t.me/teoslinker](https://t.me/teoslinker_bot))
- 🐛 Issues: [GitHub Issues](https://github.com/Elmahrosa/teoslinker-bot/issues)
- 💼 Design partners: DM open (3 slots)
- 🌐 Website: [app.teosegypt.com](https://app.teosegypt.com)

---

## License

MIT — See [LICENSE](./LICENSE)

---

*Watch the chain. Guard the execution. Trust the verdict.*
