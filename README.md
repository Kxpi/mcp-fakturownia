# Fakturownia MCP Server

An MCP (Model Context Protocol) server for the [Fakturownia](https://fakturownia.pl) Polish invoicing API. Enables LLMs to manage invoices, clients, products, and expenses through 25 tools.

## Features

- 25 MCP tools for invoices, clients, products, and expenses
- Two transport modes: **stdio** and **Streamable HTTP**
- CEIDG integration for auto-creating clients from Polish business registry
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
- `CEIDG_API_TOKEN` — For CEIDG business registry lookups

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

Host the MCP server on a public domain with API-key auth. Fakturownia and CEIDG tokens stay on the server — clients only need the MCP URL and `MCP_ACCESS_API_KEY`.

### 1. Configure secrets

```bash
cp env.example .env
```

Fill in `.env`:

| Variable | Who uses it |
|----------|-------------|
| `FAKTUROWNIA_BASE_URL`, `FAKTUROWNIA_API_TOKEN` | MCP server only |
| `CEIDG_API_TOKEN` | MCP server only (optional) |
| `MCP_ACCESS_API_KEY` | Server + every MCP client (`openssl rand -hex 32`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflared container only |

### 2. Cloudflare Tunnel

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel** → **Docker**
2. Copy the tunnel token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`
3. Add a **Public Hostname**: e.g. `mcp.yourdomain.com` → `http://mcp:3000` (service name must match compose)
4. Save

### 3. Deploy

```bash
docker compose up -d --build
```

Public MCP endpoint: `https://mcp.yourdomain.com/mcp`

Auth header on every request: `Authorization: Bearer <MCP_ACCESS_API_KEY>`

### 4. Connect remote clients

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
| | `create_client_by_nip` | Auto-create from CEIDG |
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

## License

MIT
