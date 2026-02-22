# 🔗 TeosLinker

> On-chain risk monitoring and execution guard for autonomous agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue.svg)](https://t.me/teoslinker)
[![Status: Live](https://img.shields.io/badge/Status-Live-green.svg)]()

---

## What Is This?

Your agent is about to execute an on-chain transaction.  
**But is the chain state safe right now?**

`teoslinker` watches the blockchain and tells your agent:
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
3. Add a contract to watch: `/watch 0xYourContract`
4. Get alerts when anomalies are detected

### Option B: MCP Server (For Agents)

```bash
npx @elmahrosa/teos-mcp-linker
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "linker": {
      "command": "npx",
      "args": ["@elmahrosa/teos-mcp-linker"]
    }
  }
}
```

### Option C: Self-hosted

```bash
git clone https://github.com/Elmahrosa/teoslinker-bot
cd teoslinker-bot
cp .env.example .env
# Fill in your RPC URL and Telegram bot token
npm install
npm start
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
  "timestamp": "2026-02-22T12:56:00Z"
}
```

### `monitor_contract`

Start watching a contract for changes.

**Input:**
```json
{
  "contract": "0x...",
  "events": ["Transfer", "Approval"],
  "webhook": "https://your-endpoint.com/alert"
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

## Configuration

```yaml
# teoslinker.config.yaml
networks:
  - ethereum
  - base
  - arbitrum

alerts:
  telegram:
    enabled: true
    chat_id: YOUR_CHAT_ID
  webhook:
    enabled: false
    url: ""

thresholds:
  liquidity_drop: 10%      # Alert if liquidity drops 10%
  price_deviation: 5%      # Alert if price moves 5%
  large_transfer: 100000   # Alert on transfers > $100K
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
TeosMCP Core   → combines both into one ALLOW/BLOCK verdict
```

➡️ See [TEOS_ECOSYSTEM.md](./TEOS_ECOSYSTEM.md) for full architecture.

---

## Environment Variables

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
RPC_URL_ETHEREUM=https://mainnet.infura.io/v3/YOUR_KEY

# Optional
RPC_URL_BASE=https://mainnet.base.org
RPC_URL_ARBITRUM=https://arb1.arbitrum.io/rpc
WEBHOOK_SECRET=your_webhook_secret
PORT=3000
```

---

## Contributing

1. Fork this repo
2. `git checkout -b feature/your-feature`
3. Make changes + add tests
4. Open a Pull Request

---

## Contact

- 🐦 X: [@elmahrosa](https://x.com/elmahrosa)
- 🤖 Telegram: [@TeosLinkerBot](https://t.me/teoslinker)
- 🐛 Issues: [GitHub Issues](https://github.com/Elmahrosa/teoslinker-bot/issues)
- 💼 Design partners: DM on X (3 slots open)

---

## License

MIT — See [LICENSE](./LICENSE)

---

*Watch the chain. Guard the execution. Trust the verdict.*
