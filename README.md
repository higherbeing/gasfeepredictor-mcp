# Gas Fee Predictor — MCP Server

Live Ethereum + Layer-2 gas-fee data for AI agents, via the
[Model Context Protocol](https://modelcontextprotocol.io). Read-only, no API key,
no account. Every answer carries a citation back to
[gasfeepredictor.com](https://gasfeepredictor.com).

There are two ways to connect. **Prefer the hosted one — there is nothing to install.**

---

## 1. Hosted endpoint (recommended)

If your client supports remote MCP servers — ChatGPT and Claude connectors, Cursor,
VS Code, and most current clients do — paste this URL and you are done:

```
https://api.gasfeepredictor.com/api/mcp
```

Streamable HTTP, unauthenticated, no install, no config file, nothing to keep updated.
It exposes **7 tools** — two more than the npm package (`get_gas_forecast` and
`get_gas_history`).

<details>
<summary>Client config, if your client wants JSON rather than a URL box</summary>

```json
{
  "mcpServers": {
    "gasfeepredictor": {
      "type": "streamable-http",
      "url": "https://api.gasfeepredictor.com/api/mcp"
    }
  }
}
```
</details>

Verify it yourself:

```bash
curl -s -X POST https://api.gasfeepredictor.com/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 2. npm package (stdio)

For clients that speak stdio only. Requires Node ≥ 18.

```json
{
  "mcpServers": {
    "gasfeepredictor": {
      "command": "npx",
      "args": ["-y", "gasfeepredictor-mcp"]
    }
  }
}
```

Claude Desktop keeps that file at
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS.
Restart the client, then ask: *"What's the Ethereum gas fee right now, and is it
cheaper on an L2?"*

| Env var | Default | Purpose |
|---|---|---|
| `GASFEE_API_BASE` | `https://api.gasfeepredictor.com` | Override the API base (e.g. for self-hosting). |

---

## Tools

| Tool | What it answers | Hosted | npm |
|---|---|:--:|:--:|
| `get_current_gas` | "What's the Ethereum gas fee right now?" — low/avg/high Gwei, ETH price, send-now-vs-wait. | ✅ | ✅ |
| `get_l2_gas` | "Cheapest L2 right now?" — live Arbitrum / Base / Optimism / Polygon fees. | ✅ | ✅ |
| `get_eth_price` | Current ETH/USD and 24h change. | ✅ | ✅ |
| `best_time_to_transact` | Send now or wait? Next cheaper window + expected savings. | ✅ | ✅ |
| `estimate_transaction_cost` | USD cost of an ETH transfer / USDC transfer / Uniswap swap / NFT mint (or custom gas), per tier. | ✅ | ✅ |
| `get_gas_forecast` | Forward-looking hourly gas forecast, up to 24h ahead. | ✅ | — |
| `get_gas_history` | Recent historical mainnet gas over a chosen window, with min/max/avg. | ✅ | — |

## Notes

- Read-only and unauthenticated — it only reads public gas data.
- Upstream data refreshes every ~30–60s.
- Served from `api.gasfeepredictor.com`, not the apex, so automated clients are not
  challenged by the CDN's bot protection.
- MIT licensed.

## Changelog

**1.1.0** — `get_current_gas` and `estimate_transaction_cost` now fall back to
`/api/eth-price` when the dashboard payload returns `ethPrice: null` (upstream price
cooldown). Previously they rendered `ETH ≈ $undefined` or failed outright while the
price endpoint was serving fine.
