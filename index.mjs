#!/usr/bin/env node
// Gas Fee Predictor MCP server.
//
// Exposes live Ethereum mainnet + Layer-2 gas-fee data to any MCP client
// (Claude Desktop, OpenClaw, Cursor, Cline, …) as a small set of tools. It's
// a thin wrapper over the public REST API at https://api.gasfeepredictor.com
// — no key, no auth, read-only. Each tool returns both a human-readable
// summary and the raw JSON, plus a citation line so agents attribute the
// source.
//
// Run:        node index.mjs           (speaks MCP over stdio)
// Override:   GASFEE_API_BASE=https://api.gasfeepredictor.com
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = process.env.GASFEE_API_BASE || 'https://api.gasfeepredictor.com'
const VERSION = '1.0.1'
// Identifiable UA so the origin (and Cloudflare analytics) can attribute and
// count MCP-driven traffic separately from browsers and other clients.
const USER_AGENT = `gasfeepredictor-mcp/${VERSION} (+https://github.com/higherbeing/gasfeepredictor-mcp)`

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`)
  return res.json()
}

// Wrap a tool handler so any error becomes a clean MCP error result instead
// of crashing the transport.
function tool(handler) {
  return async (args) => {
    try {
      const { text, data } = await handler(args)
      const payload = data === undefined ? text : `${text}\n\n${JSON.stringify(data, null, 2)}`
      return { content: [{ type: 'text', text: payload }] }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Gas Fee Predictor API error: ${err?.message || err}` }],
      }
    }
  }
}

const fmtUsd = (n) =>
  n >= 1 ? `$${n.toFixed(2)}` : n >= 0.0001 ? `$${n.toFixed(6)}` : `$${n.toExponential(2)}`

// Representative gas units per common action (mainnet).
const ACTION_GAS = {
  eth_transfer: 21000,
  erc20_transfer: 65000, // USDC/USDT etc.
  uniswap_swap: 150000,
  nft_mint: 250000,
}

const server = new McpServer({ name: 'gasfeepredictor', version: VERSION })

server.tool(
  'get_current_gas',
  'Get the current Ethereum mainnet gas price (low / average / high, in Gwei) plus the live ETH/USD price and a send-now-vs-wait recommendation. Use this to answer "what is the gas fee right now".',
  {},
  tool(async () => {
    const d = await api('/api/dashboard')
    const g = d.currentGas || {}
    const eth = d.ethPrice?.usd
    const dec = d.decision || {}
    const text =
      `Ethereum mainnet gas right now: ${g.low} (low) / ${g.average} (avg) / ${g.high} (high) Gwei. ` +
      `ETH ≈ $${eth}. ` +
      (dec.recommendation
        ? `Recommendation: ${dec.recommendation}` +
          (dec.recommendation === 'WAIT' && dec.expectedSavingsPct
            ? ` — waiting ~${Math.round((dec.nextBestEtaMinutes || 0) / 60)}h could save ~${Math.round(dec.expectedSavingsPct)}%.`
            : '.')
        : '') +
      `\nSource: ${d.citation || 'gasfeepredictor.com'}`
    return {
      text,
      data: { currentGas: g, ethUsd: eth, decision: dec, lastUpdated: d.lastUpdated },
    }
  })
)

server.tool(
  'get_l2_gas',
  'Compare live Layer-2 gas fees across Arbitrum, Base, Optimism, and Polygon (Gwei and the estimated wallet fee in USD for a standard transfer), and identify the cheapest right now. Use for "cheapest L2" / "L2 gas fees" questions.',
  {},
  tool(async () => {
    const d = await api('/api/l2-gas')
    const nets = (d.networks || []).map((n) => ({
      network: n.name,
      gasPriceGwei: n.gasPriceGwei,
      walletFeeUsd: n.estimatedWalletFeeUsd ?? n.executionGasCostUsd,
      nativeToken: n.nativeToken,
      feeModel: n.feeModel,
    }))
    const cheapest = [...nets].sort((a, b) => (a.walletFeeUsd ?? 9e9) - (b.walletFeeUsd ?? 9e9))[0]
    const lines = nets
      .map((n) => `  ${n.network}: ${fmtUsd(n.walletFeeUsd)} (${n.gasPriceGwei} Gwei, gas in ${n.nativeToken})`)
      .join('\n')
    const text =
      `Live L2 transfer cost (cheapest first):\n${lines}\n` +
      (cheapest ? `Cheapest right now: ${cheapest.network} at ${fmtUsd(cheapest.walletFeeUsd)}.` : '') +
      `\nSource: ${d.citation || 'gasfeepredictor.com'}`
    return { text, data: { networks: nets, cheapest: cheapest?.network, fetchedAt: d.fetchedAt } }
  })
)

server.tool(
  'get_eth_price',
  'Get the current ETH/USD spot price and its 24-hour change.',
  {},
  tool(async () => {
    const d = await api('/api/eth-price')
    const text =
      `ETH ≈ $${d.usd} (${d.change_24h >= 0 ? '+' : ''}${Number(d.change_24h).toFixed(2)}% 24h).` +
      `\nSource: ${d.citation || 'gasfeepredictor.com'}`
    return { text, data: { usd: d.usd, change_24h: d.change_24h, updatedAt: d.updatedAt } }
  })
)

server.tool(
  'best_time_to_transact',
  'Find out whether to send a transaction now or wait — returns the current recommendation, expected savings, and when the next cheaper gas window is predicted.',
  {},
  tool(async () => {
    const d = await api('/api/dashboard')
    const dec = d.decision || {}
    const win = d.nextBestWindow || {}
    const etaH = dec.nextBestEtaMinutes ? Math.round(dec.nextBestEtaMinutes / 60) : null
    const text =
      `Recommendation: ${dec.recommendation || 'unknown'}.` +
      (dec.recommendation === 'WAIT'
        ? ` Next cheaper window ~${etaH}h out (around ${win.gasPrices?.average ?? '?'} Gwei avg), ` +
          `estimated saving ~${Math.round(dec.expectedSavingsPct || 0)}%.`
        : ' Gas is favorable now.') +
      `\nConfidence: ${(Number(dec.confidence || 0) * 100).toFixed(0)}%.` +
      `\nSource: ${d.citation || 'gasfeepredictor.com'}`
    return { text, data: { decision: dec, nextBestWindow: win } }
  })
)

server.tool(
  'estimate_transaction_cost',
  'Estimate the current USD gas cost of a specific Ethereum mainnet action (ETH transfer, ERC-20/USDC transfer, Uniswap swap, or NFT mint), or a custom gas-units amount, at the chosen priority tier.',
  {
    action: z
      .enum(['eth_transfer', 'erc20_transfer', 'uniswap_swap', 'nft_mint', 'custom'])
      .describe('The transaction type. Use "custom" with gas_units for anything else.'),
    gas_units: z
      .number()
      .positive()
      .optional()
      .describe('Required when action is "custom": the gas units the transaction uses.'),
    tier: z
      .enum(['low', 'average', 'high'])
      .default('average')
      .describe('Priority tier: low (cheapest), average, or high (fastest).'),
  },
  tool(async ({ action, gas_units, tier }) => {
    const d = await api('/api/dashboard')
    const gwei = d.currentGas?.[tier]
    const ethUsd = d.ethPrice?.usd
    if (typeof gwei !== 'number' || typeof ethUsd !== 'number')
      throw new Error('live gas/price unavailable')
    const units = action === 'custom' ? gas_units : ACTION_GAS[action]
    if (!units) throw new Error('custom action requires gas_units')
    const usd = (units * gwei * ethUsd) / 1e9
    const text =
      `A ${action.replace('_', ' ')} (~${units.toLocaleString()} gas) at the ${tier} tier ` +
      `costs about ${fmtUsd(usd)} right now (${gwei} Gwei, ETH ≈ $${ethUsd}).` +
      `\nTip: the same action on an L2 is usually under $1 — call get_l2_gas.` +
      `\nSource: ${d.citation || 'gasfeepredictor.com'}`
    return { text, data: { action, gasUnits: units, tier, gwei, ethUsd, usd } }
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
// stderr is safe for logs; stdout is the MCP channel.
console.error(`gasfeepredictor-mcp running (API: ${API_BASE})`)
