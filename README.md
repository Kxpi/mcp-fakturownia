# Fakturownia MCP Server

An MCP (Model Context Protocol) server for the [Fakturownia](https://fakturownia.pl) Polish invoicing API. Enables LLMs to manage invoices, clients, products, and expenses through 25 tools.

## Features

- 25 MCP tools for invoices, clients, products, and expenses
- Two transport modes: **stdio** and **Streamable HTTP**
- Auto-create clients by NIP via the MF VAT whitelist (CEIDG fallback for never-VAT-registered entities)
- Polish NIP validation with checksum
- Response filtering to minimize token usage
- Retry logic with exponential backoff

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp env.example .env
# Edit .env with your Fakturownia API credentials
```

Required:
- `FAKTUROWNIA_BASE_URL` — Your Fakturownia subdomain URL
- `FAKTUROWNIA_API_TOKEN` — Your API token

Optional:
- `CEIDG_API_TOKEN` — CEIDG fallback when a NIP was never VAT-registered (optional; whitelist needs no key)

### 3. Build & Run

```bash
# Build
npm run build

# Run (stdio mode — for MCP clients like Claude Desktop)
npm start

# Run (HTTP mode — for remote/Docker deployment)
npm run start:http
```

### Development

```bash
# Dev mode with hot reload
npm run dev          # stdio
npm run dev:http     # HTTP server on port 3000

# Type check
npm run type-check

# Run tests
npm test
```

## MCP Client Configuration

### Claude Desktop (stdio)

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "fakturownia": {
      "command": "node",
      "args": ["/path/to/mcp-fakturownia/dist/index.js"],
      "env": {
        "FAKTUROWNIA_BASE_URL": "https://YOUR_SUBDOMAIN.fakturownia.pl",
        "FAKTUROWNIA_API_TOKEN": "your_token"
      }
    }
  }
}
```

### HTTP Mode (local)

```bash
# Start the server (no auth if MCP_ACCESS_API_KEY is unset)
PORT=3000 npm run start:http

# MCP endpoint
POST http://localhost:3000/mcp
```

## Production (Docker + Cloudflare Tunnel)

Host the MCP server on a public domain. Fakturownia and CEIDG tokens stay on the server — clients authenticate at the MCP layer (see below).

### Authentication options

**Recommended for most setups:** static Bearer token (`MCP_ACCESS_API_KEY`). Simpler, fewer moving parts. Works well for Cursor, OpenClaw, Claude Desktop (via `mcp-remote`), and local dev.

**OAuth (Claude web / mobile only):** Claude custom connectors require OAuth discovery — they won't accept a pasted API key. The OAuth implementation here is a **minimal single-user shim**, not a general-purpose identity provider:

- One shared consent password; all tokens map to a single owner
- Built only to unlock Claude web, desktop, and mobile custom connectors against the same deployed server
- Hardcoded Claude redirect URIs; not for arbitrary OAuth clients
- Registered clients persist on disk (`/data` volume); authorization codes (mid-login tickets) do not
- Refresh tokens (90-day default) allow silent access-token renewal without re-entering the consent password; Anthropic's bridge may still occasionally require re-consent ([#247](https://github.com/anthropics/claude-ai-mcp/issues/247))

If you don't need Claude web/mobile, skip OAuth entirely and use `MCP_ACCESS_API_KEY`.

### 1. Configure secrets

```bash
cp env.example .env
```

Fill in `.env`:

| Variable | Who uses it |
|----------|-------------|
| `FAKTUROWNIA_BASE_URL`, `FAKTUROWNIA_API_TOKEN` | MCP server only |
| `CEIDG_API_TOKEN` | MCP server only (optional) |
| `MCP_PUBLIC_URL` | OAuth metadata + JWT audience (required for Claude OAuth) |
| `OAUTH_JWT_SECRET` | Signs OAuth access tokens (`openssl rand -hex 32`) |
| `OAUTH_CONSENT_PASSWORD` | Password on the OAuth consent page (single user) |
| `OAUTH_REFRESH_TOKEN_TTL_SECONDS` | Refresh token lifetime (default 90 days) |
| `OAUTH_DATA_DIR` | Directory for persisted OAuth state (default `/data`; mounted as Docker volume) |
| `MCP_ACCESS_API_KEY` | Static Bearer — **recommended** for Cursor, OpenClaw, Desktop via mcp-remote |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflared container only |

### 2. Cloudflare Tunnel

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel** → **Docker**
2. Copy the tunnel token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`
3. Add a **Public Hostname**: e.g. `mcp.yourdomain.com` → `http://mcp:3000` (service name must match compose)
4. Set `MCP_PUBLIC_URL=https://mcp.yourdomain.com` (must match the public hostname, no trailing slash)
5. Save

### 3. Deploy

```bash
docker compose up -d --build
```

Public MCP endpoint: `https://mcp.yourdomain.com/mcp`

### 4. Connect Claude web/mobile (OAuth — optional)

Only needed for Claude **custom connectors** in web or mobile. Skip if you use Claude Desktop with `mcp-remote` + static Bearer (section 5).

1. Claude → **Customize → Connectors → Add custom connector**
2. URL: `https://mcp.yourdomain.com/mcp` (must match `MCP_PUBLIC_URL/mcp` exactly)
3. Claude discovers OAuth metadata, opens `/oauth/authorize` in your browser
4. Enter `OAUTH_CONSENT_PASSWORD` → **Approve**
5. Enable the connector in chat via **+ → Connectors**

Verify discovery:

```bash
curl -i https://mcp.yourdomain.com/mcp
curl https://mcp.yourdomain.com/.well-known/oauth-protected-resource
```

**Note:** Registered OAuth clients and refresh tokens persist on the `/data` volume across restarts. Short-lived authorization codes (mid-login) are not persisted — if a restart happens during login, approve again. Access tokens expire after ~24h; refresh tokens renew them silently (consent password only needed on initial connect or after refresh expiry).

### 5. Connect other clients (static Bearer — recommended)

Optional if `MCP_ACCESS_API_KEY` is set — this is the **preferred** auth method when your client supports it. Auth header: `Authorization: Bearer <MCP_ACCESS_API_KEY>`

**Cursor** (or other HTTP-native MCP clients):

```json
{
  "mcpServers": {
    "fakturownia": {
      "url": "https://mcp.yourdomain.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_ACCESS_API_KEY"
      }
    }
  }
}
```

**Claude Desktop** (stdio config; use `mcp-remote` bridge for Bearer auth):

Settings → Developer → Edit Config:

```json
{
  "mcpServers": {
    "fakturownia": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.yourdomain.com/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer YOUR_MCP_ACCESS_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop fully after saving.

**ChatGPT** (paid plan + Developer Mode): Settings → Security → enable Developer mode → Plugins → create app with URL `https://mcp.yourdomain.com/mcp` and Token auth.

**Local dev without auth:** run `npm run dev:http` without setting `MCP_ACCESS_API_KEY`.

## Docker (standalone)

```bash
docker build -t fakturownia-mcp .
docker run --env-file .env -p 3000:3000 fakturownia-mcp
```

For production with tunnel, use `docker compose` above instead.

## Tools

| Category | Tool | Description |
|----------|------|-------------|
| System | `health_check` | Verify API connectivity |
| Clients | `get_all_clients` | List clients |
| | `get_client_by_nip` | Find by NIP |
| | `get_client_by_name` | Search by name |
| | `create_client` | Create manually |
| | `create_client_by_nip` | Auto-create from VAT whitelist (CEIDG fallback) |
| | `update_client` | Update fields |
| | `delete_client` | Delete (confirm required) |
| Invoices | `get_invoices` | List with filters |
| | `get_invoice_by_id` | Full details |
| | `create_invoice` | Create with positions |
| | `update_invoice` | Update metadata |
| | `delete_invoice` | Delete (confirm required) |
| | `cancel_invoice` | Cancel |
| | `send_invoice_to_ksef` | Send existing invoice to KSeF (confirm required) |
| | `mark_invoice_as_paid` | Record a payment (KSeF-safe) |
| | `get_client_invoices_summary` | Client stats |
| Products | `list_products` | List catalog |
| | `create_product` | Add product |
| | `update_product` | Update product |
| | `delete_product` | Delete product |
| Expenses | `get_expenses` | List expense invoices |
| | `get_expense_by_id` | Full expense details |
| | `create_expense` | Create expense from vendor |
| | `delete_expense` | Delete (confirm required) |

## Client lookup by NIP (`create_client_by_nip`)

Primary source is the Ministry of Finance [VAT whitelist](https://www.podatki.gov.pl/wykaz-podatnikow-vat-wyszukiwarka) API — no API key:

```
GET https://wl-api.mf.gov.pl/api/search/nip/{nip}?date=YYYY-MM-DD
```

It covers both sole proprietorships (JDG) and KRS entities (sp. z o.o., S.A., …) and returns VAT status plus verified bank accounts. `date` is required; we send today. Rate limit is about **10 requests/day per IP** (batch endpoint allows 30 NIPs per call; we query one at a time). 429 responses are retried with backoff.

**Fallback to CEIDG** only when the whitelist returns an empty shell: `subject` is null, or `subject.name` is null. That means the NIP was never VAT-registered. CEIDG still needs `CEIDG_API_TOKEN` and only covers JDG.

Do **not** treat `statusVat: "Niezarejestrowany"` as "not found". Removed payers keep name/address/REGON; that is a valid whitelist hit. The empty-shell (never registered) case is the null name.

VAT status, removal/denial reasons, and verified account numbers are stored on the Fakturownia client `note` (first account also goes into `bank_account`). Unusual address strings that are not `street, XX-XXX city` are left in `street` for manual review.

## License

MIT
