# Gas Fee Predictor — MCP Server

Live Ethereum + Layer-2 gas-fee data for AI agents, via the
[Model Context Protocol](https://modelcontextprotocol.io). Works with
**Claude Desktop, OpenClaw, Cursor, Cline**, and any other MCP client.

It's a thin, read-only wrapper over the free public API at
`https://api.gasfeepredictor.com` (no key, no auth). Every answer includes a
citation back to [gasfeepredictor.com](https://gasfeepredictor.com).

## Tools

| Tool | What it answers |
|---|---|
| `get_current_gas` | "What's the Ethereum gas fee right now?" — low/avg/high Gwei, ETH price, send-now-vs-wait. |
| `get_l2_gas` | "Cheapest L2 right now?" — live Arbitrum / Base / Optimism / Polygon fees. |
| `get_eth_price` | Current ETH/USD and 24h change. |
| `best_time_to_transact` | Send now or wait? Next cheaper window + expected savings. |
| `estimate_transaction_cost` | USD cost of an ETH transfer / USDC transfer / Uniswap swap / NFT mint (or custom gas), per tier. |

## Install

With npm (once published):

```bash
npx gasfeepredictor-mcp
```

Or from source:

```bash
git clone https://github.com/higherbeing/gasfeepredictor-mcp
cd gasfeepredictor-mcp
npm install
npm start
```

Requires Node ≥ 18.

## Configure your client

### Claude Desktop
Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

(Or use `"command": "node", "args": ["/absolute/path/to/gasfeepredictor-mcp/index.mjs"]` to run from source.)

Restart Claude Desktop, then ask: *"What's the Ethereum gas fee right now, and is it cheaper on an L2?"*

### OpenClaw / Cursor / Cline
Any MCP-capable client uses the same shape — register a stdio server with
`command: npx, args: ["-y", "gasfeepredictor-mcp"]` (or `node` + the path to
`index.mjs`) in that client's MCP servers config.

## Config

| Env var | Default | Purpose |
|---|---|---|
| `GASFEE_API_BASE` | `https://api.gasfeepredictor.com` | Override the API base. |

## Notes
- Read-only and unauthenticated — it only reads public gas data.
- Data refreshes ~every 30–60s upstream.
- MIT licensed.
