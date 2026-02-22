# TeosMCP Ecosystem

> Deterministic safety infrastructure for autonomous AI agents

---

## The Problem

AI agents can write code and move money.  
But they have **no immune system**.

| Risk | Example |
|------|---------|
| Bad code | Exploits, drained wallets |
| Bad timing | MEV attacks, failed transactions |
| No audit trail | "The agent did it" — not acceptable |

---

## The Solution: Three Layers, One Verdict

```
┌─────────────────────────────────────────────────┐
│                 TEOSMCP CORE                    │
│       Unified Policy Engine: ALLOW / BLOCK      │
│           Deterministic · Auditable · Fast      │
└─────────────────────────────────────────────────┘
              ↑                        ↑
 ┌────────────────────┐   ┌────────────────────┐
 │   CODEGUARD MCP    │   │    LINKER MCP      │
 │                    │   │                    │
 │  Static code risk  │   │  On-chain risk     │
 │  scoring before    │   │  monitoring +      │
 │  execution         │   │  execution guard   │
 └────────────────────┘   └────────────────────┘
```

**Every agent action goes through all three layers.**  
If any layer says BLOCK → execution is stopped.

---

## Repositories

| Repo | Layer | Purpose | Status |
|------|-------|---------|--------|
| [`agent-code-risk-mcp`](https://github.com/Elmahrosa/agent-code-risk-mcp) | CodeGuard | Code risk scoring before run | ✅ Live |
| [`teoslinker-bot`](https://github.com/Elmahrosa/teoslinker-bot) | Linker | On-chain monitoring + alerts | ✅ Live |
| `teosmcp-core` *(coming soon)* | Core | Unified policy engine | 🔄 In progress |

---

## How It Works

### For Developers (Simple)

```
Your Agent wants to execute code
         ↓
CodeGuard checks: Is this code safe?
         ↓
Linker checks: Is the chain state safe?
         ↓
Core decision: ALLOW or BLOCK
         ↓
If ALLOW → Agent executes
If BLOCK → Agent stops + logs reason
```

### For Builders (Technical)

```python
# Policy configuration
policy:
  code:
    tool: teos-mcp-codeguard
    threshold: 0.3        # 0 = safe, 1 = dangerous
    action: BLOCK
  onchain:
    tool: teos-mcp-linker
    max_slippage: 0.5%
    action: BLOCK
  final:
    logic: ALL_REQUIRED   # Both must ALLOW
```

---

## Quick Start

### Install CodeGuard (Code Risk Layer)
```bash
npx @elmahrosa/teos-mcp-codeguard
```

### Install Linker (On-Chain Layer)
```bash
# Coming soon
npx @elmahrosa/teos-mcp-linker
```

### Add to your MCP config
```json
{
  "mcpServers": {
    "codeguard": {
      "command": "npx",
      "args": ["@elmahrosa/teos-mcp-codeguard"]
    }
  }
}
```

---

## Why Deterministic?

| Approach | Problem |
|----------|---------|
| LLM judge | Non-deterministic, slow, expensive, drifts |
| Rule-based only | Misses context, not composable |
| **TeosMCP** | Same inputs → same output. Always. Auditable. |

> **Core principle:** If you can't reproduce the decision, you can't trust the system.

---

## Who Is This For?

| User Type | Use Case |
|-----------|----------|
| 🤖 Agent Developers | Gate your agent's code execution |
| 💰 DeFi Builders | Protect on-chain transactions |
| 🏢 Enterprises | Compliance + audit trail for AI actions |
| 🔬 Researchers | Study agent safety patterns |

---

## Pricing

| Plan | Decisions/month | Price |
|------|----------------|-------|
| Free | 1,000 | $0 |
| Pro | 100,000 | $99/month |
| Enterprise | Unlimited + custom MCPs | $2,000+/month |

---

## Roadmap

- ✅ **Now** — CodeGuard MCP live, Linker bot live
- 🔄 **30 days** — Unified policy engine (teosmcp-core)
- 📋 **60 days** — On-chain attestation (L2 verdict hashes)
- 📋 **90 days** — Verifier network (decentralized re-execution)
- 📋 **180 days** — Teos Protocol open standard

---

## Contributing

We welcome contributions to any layer:

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Contact & Community

- 🐦 X/Twitter: [@elmahrosa](https://x.com/elmahrosa)
- 🐛 Issues: Use GitHub Issues on any repo
- 💼 Design partners: DM open (3 slots available)
- 📧 Enterprise: Open a GitHub issue tagged `enterprise`

---

## License

MIT — See [LICENSE](./LICENSE) for details.

---

*TeosMCP: Don't trust the agent. Verify the decision.*
