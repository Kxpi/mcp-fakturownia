# CLAUDE.md — Fakturownia MCP Server

Complete project context and implementation guide for recreating the Fakturownia MCP server from scratch.

## Project Overview

An MCP (Model Context Protocol) server that wraps the Fakturownia REST API, enabling LLMs to manage Polish invoices, clients, and products. Includes VAT whitelist lookup (with CEIDG fallback) for automatic client creation from NIP (tax ID).

### What It Does

- Exposes 25 MCP tools for managing invoices, clients, products, and expenses
- Two transport modes: **stdio** (for direct MCP client use) and **HTTP with Streamable HTTP** (for remote/Docker deployment)
- Integrates with the MF VAT whitelist (primary) and CEIDG API v3 (fallback) for fetching company data by NIP
- Filters API responses to minimize LLM token usage
- Validates Polish NIP numbers with checksum algorithm
- Handles VAT calculations (net/gross conversion)

---

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Runtime | Node.js 20+ | ES modules (`"type": "module"`) |
| Language | TypeScript 5.x | Strict mode, Node16 module resolution |
| MCP SDK | `@modelcontextprotocol/sdk` | Use latest version |
| HTTP Client | `undici` | For Fakturownia, VAT whitelist & CEIDG API calls |
| Validation | `zod` | Input schemas with LLM-friendly transforms |
| Logging | `pino` + `pino-pretty` | Logs to **stderr** (critical for stdio MCP) |
| Env | `dotenv` | `.env` file loading |
| Testing | `vitest` | Unit tests for utils |
| Linting | ESLint + Prettier | Standard TS config |
| Build | `tsc` | Output to `dist/` |
| Container | Docker multi-stage | `node:20-alpine` |

---

## Architecture

```
src/
├── index.ts              # Entry point (stdio transport)
├── http-server.ts        # HTTP server (Streamable HTTP transport)
├── server.ts             # MCP server creation, tool registration
├── config.ts             # Environment validation (Zod)
├── logger.ts             # Pino logger → stderr
├── api/
│   ├── fakturowniaClient.ts   # Fakturownia HTTP client with retries
│   ├── vatWhitelistClient.ts  # MF VAT whitelist (primary NIP lookup)
│   ├── ceidgClient.ts         # CEIDG API v3 client (fallback)
│   └── endpoints.ts           # API endpoint path definitions
├── tools/
│   ├── defineTool.ts   # Zod → MCP JSON Schema helper
│   ├── health.ts         # health_check tool
│   ├── clients.ts        # 7 client tools + lookup_company_by_nip
│   ├── invoices.ts       # 9 invoice tools
│   ├── products.ts       # 4 product tools
│   └── expenses.ts       # 4 expense tools (faktury kosztowe)
├── schemas/
│   ├── common.ts         # Shared Zod schemas (dates, ids)
│   ├── clients.ts        # Client input/output schemas
│   ├── invoices.ts       # Invoice input/output schemas
│   ├── products.ts       # Product input/output schemas
│   └── expenses.ts       # Expense input/output schemas
└── utils/
    ├── errors.ts         # FakturowniaError with retryable flag
    ├── dates.ts          # Date formatting helpers
    ├── money.ts          # VAT/money calculations
    ├── nip.ts            # Polish NIP validation
    ├── polishAddress.ts  # Parse whitelist `street, XX-XXX city` strings
    ├── companyLookup.ts  # suggested_create_payload + lookup warnings
    └── responseFilter.ts # API response field filtering
```

### Key Design Decisions

1. **Tool definitions live alongside handlers** — each `tools/*.ts` file exports both the MCP tool definition object and the handler function
2. **Zod is the single source of truth** — `defineTool.ts` generates MCP JSON Schema from Zod via `z.toJSONSchema()`; runtime validation uses `schema.parse(args)`
3. **Server.ts uses a handler registry map** — tools registered as `{ def, handle }` pairs, looked up by name in `CallTool`
4. **Response filtering** — Fakturownia API returns 50+ fields per object; `responseFilter.ts` picks only essential fields to save LLM tokens
5. **Zod schemas handle LLM null values** — LLMs frequently send `null` instead of omitting fields; all optional schemas use `.nullish().transform()` pattern
6. **Single API client instance** created in `server.ts`, passed to all tool handlers

---

## CRITICAL: Use Streamable HTTP, NOT SSE

The original implementation uses the **deprecated SSE transport** (`SSEServerTransport`). The new implementation **MUST use Streamable HTTP** instead.

### Why Streamable HTTP

- SSE transport is being deprecated in the MCP SDK
- Streamable HTTP is the recommended replacement for HTTP-based MCP servers
- It uses a single HTTP endpoint instead of separate `/sse` + `/message` endpoints
- Better compatibility with proxies, load balancers, and serverless environments
- Supports both streaming and non-streaming responses

### Streamable HTTP Implementation

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

Key differences from SSE:
- Single endpoint (e.g., `/mcp`) handles both GET (for streaming) and POST (for requests)
- Session management is built into the transport
- No need to manually track active transports in a Map
- CORS still needed for browser-based clients

Look up the latest `@modelcontextprotocol/sdk` documentation for the exact `StreamableHTTPServerTransport` API, as it may have evolved since this was written.

---

## Environment Variables

```env
# REQUIRED
FAKTUROWNIA_BASE_URL=https://YOUR_SUBDOMAIN.fakturownia.pl
FAKTUROWNIA_API_TOKEN=your_api_token_here

# OPTIONAL
CEIDG_API_TOKEN=                  # Fallback for lookup_company_by_nip when NIP was never VAT-registered
LOG_LEVEL=info                    # debug | info | warn | error
REQUEST_TIMEOUT_MS=20000          # HTTP request timeout
MAX_LOG_LINES=200                 # Unused in current impl
```

Config validation with Zod — exits process with clear error messages if required vars are missing.

---

## Complete Tool Inventory (25 tools)

### System (1)
| Tool | Description |
|------|-------------|
| `health_check` | Verify API connectivity by fetching 1 invoice |

### Clients (7)
| Tool | Description |
|------|-------------|
| `get_all_clients` | List clients (default limit: 100) |
| `get_client_by_nip` | Find single client by NIP (exact match) |
| `get_client_by_name` | Search clients by name (partial, case-insensitive) |
| `lookup_company_by_nip` | Registry lookup (VAT whitelist + CEIDG fallback); returns suggested_create_payload |
| `create_client` | Create client in Fakturownia |
| `update_client` | Update client fields |
| `delete_client` | Delete client (requires confirm=true) |

### Invoices (9)
| Tool | Description |
|------|-------------|
| `get_invoices` | List with filters (default: last 30 days) |
| `get_invoice_by_id` | Get full detail with line items |
| `create_invoice` | Create with positions, auto-calculates totals |
| `update_invoice` | Update dates, status, notes, buyer info |
| `delete_invoice` | Permanent delete (requires confirm=true) |
| `cancel_invoice` | Safer alternative to delete |
| `send_invoice_to_ksef` | Send existing invoice to KSeF (requires confirm=true) |
| `mark_invoice_as_paid` | Record payment via `/banking/payments.json` (KSeF-safe) |
| `get_client_invoices_summary` | Aggregated stats (totals, by status) |

### Products (4)
| Tool | Description |
|------|-------------|
| `list_products` | List catalog products (default limit: 100) |
| `create_product` | Add product to catalog |
| `update_product` | Update product fields (name, price, code, etc.) |
| `delete_product` | Remove product from catalog |

### Expenses (4)
| Tool | Description |
|------|-------------|
| `get_expenses` | List expense invoices (faktury kosztowe) with filters |
| `get_expense_by_id` | Get full expense detail with vendor info and positions |
| `create_expense` | Create expense invoice (vendor_name, positions, accounting_kind) |
| `delete_expense` | Delete expense (requires confirm=true) |

---

## Fakturownia API Specifics

### Docs
Please refer to https://github.com/fakturownia/API

### Authentication
- API token passed as **query parameter** `api_token=xxx` on every request
- NOT as a header (this is Fakturownia-specific)

### Endpoint Pattern
All endpoints use `.json` suffix:
```
GET    /clients.json
GET    /clients/{id}.json
POST   /clients.json              (body: { client: {...} })
PUT    /clients/{id}.json         (body: { client: {...} })
DELETE /clients/{id}.json
```

Same pattern for `/invoices.json` and `/products.json`.

### Request Body Wrapping
Fakturownia wraps payloads in a root key:
```json
{ "client": { "name": "Foo", "tax_no": "1234563218" } }
{ "invoice": { "client_id": 123, "positions": [...] } }
{ "product": { "name": "Widget", "tax": 23 } }
```

### Invoice Positions — The `total_price_gross` Requirement

**CRITICAL PITFALL**: When creating invoices, Fakturownia API expects `total_price_gross` per position, NOT unit prices. The tool must:

1. Accept `unit_price_net` OR `unit_price_gross` from the user
2. Calculate gross from net if needed: `gross = net * (1 + vat_rate / 100)`
3. Calculate `total_price_gross = unit_price_gross * quantity`
4. Send `total_price_gross` in the position payload

Position payload sent to API:
```json
{
  "name": "Service",
  "quantity": 2,
  "tax": 23,
  "total_price_gross": 246.00
}
```

### Invoice Date Filtering — The `period=more` Requirement

**CRITICAL PITFALL**: When filtering invoices by date range (`date_from`/`date_to`), the Fakturownia API **silently ignores** date parameters unless you also send `period=more`. Also set `search_date_type=issue_date` to specify which date field to filter on.

```typescript
if (from || to) {
  query.period = 'more';
  query.search_date_type = 'issue_date';
  if (from) query.date_from = from;
  if (to) query.date_to = to;
}
```

### Recording payments (KSeF-safe)

**CRITICAL PITFALL**: After an invoice is sent to KSeF (`gov_id` assigned), `PUT /invoices/{id}` is blocked with 422: "Nie można edytować dokumentu, ponieważ został przesłany do KSeF." Do **not** mark paid by updating invoice `status`. Create a banking payment instead:

```
POST /banking/payments.json
{
  "banking_payment": {
    "name": "Payment for invoice FV/1/2026",
    "price": 123.00,
    "invoice_ids": [12345],
    "paid": true,
    "kind": "api",
    "paid_date": "2026-08-17"
  }
}
```

`price` should be the unpaid remainder (`price_gross - paid`). Fakturownia then sets invoice status to paid/partial.

### Invoice Cancellation
`POST /invoices/{id}/cancel.json` — marks as cancelled without deleting.

### Expenses (faktury kosztowe)
Expenses in Fakturownia are **regular invoices with `income: "0"`**, not a separate entity. They use the same `/invoices.json` endpoints.

Key differences:
- `income: "0"` marks an invoice as an expense (vs `"1"` for income)
- `kind: "vat"` must be set explicitly
- **CRITICAL field mapping**: `seller_*` ALWAYS = your company/department, `buyer_*` ALWAYS = the external entity. For expenses, the vendor goes in `buyer_*` fields (buyer_name, buyer_tax_no). The printout labels are swapped (buyer shown as "Sprzedawca", seller shown as "Nabywca") but the API data model stays the same.
- `accounting_kind` categorizes the expense: `purchases`, `expenses`, `media`, `salary`, `incident`, `fuel0`, `fuel_expl75`, `fuel_expl100`, `fixed_assets`, `fixed_assets50`, `no_vat_deduction`
- List expenses: `GET /invoices.json?income=no`
- `delivery_date` (data wpłynięcia) is an expense-specific field

The expense tools expose `vendor_name`/`vendor_nip` which map to `buyer_name`/`buyer_tax_no` in the API.

### Field Name Inconsistencies
Fakturownia uses different field names in different contexts:
- `price_net` vs `total_price_net` vs `net_price`
- `price_gross` vs `total_price_gross` vs `gross_price`
- `payment_to` (due date in API) vs `due_date` (user-facing)
- `tax_no` (client NIP in API) vs `nip` (user-facing)
- `post_code` (API) vs `zip` (user-facing)
- `note` (API) vs `notes` (user-facing)
- `payment_type` (API) vs `payment_method` (user-facing)
- `tax` (VAT rate in API) vs `vat_rate` (user-facing)

The tool layer translates between user-friendly names and API field names.

---

## VAT Whitelist (primary NIP lookup)

`lookup_company_by_nip` looks up the MF VAT whitelist first, then CEIDG. The agent calls `create_client` separately with `suggested_create_payload`.

```
GET https://wl-api.mf.gov.pl/api/search/nip/{nip}?date=YYYY-MM-DD
```

No API key. `date` is required (today). Covers JDG **and** KRS entities. Returns VAT status and verified `accountNumbers`. Rate limit ~10 requests/day per IP; 429 is retried with backoff.

**Empty shell vs removed payer — do not mix these up:**

- `subject == null` or `subject.name == null` → never VAT-registered → fall back to CEIDG
- `statusVat === "Niezarejestrowany"` **with a name** → was registered, later removed → **usable whitelist hit**, not a miss

Address is a single string in `workingAddress ?? residenceAddress`. Parse `street, XX-XXX city` via `parsePolishAddress`; unparsed leftovers stay in `street` for manual review.

VAT status, removal/denial reasons, and account numbers go into the Fakturownia `note`. First account also fills `bank_account`.

---

## CEIDG Integration (fallback for never-VAT-registered NIPs)

CEIDG is the **fallback** when the VAT whitelist returns an empty shell. It still only covers sole proprietorships (JDG).

> **FUTURE**: For entities that have never had VAT obligations (some foundations/holdings), GUS BIR1 (REGON) would cover more than CEIDG. Out of scope until it matters. See: https://api.stat.gov.pl/Home/RegonApi

### API Version
**CEIDG API v3** — as of October 2025, v1 and v2 are deprecated.

### Endpoint
```
GET https://dane.biznes.gov.pl/api/ceidg/v3/firmy?nip={nip}
```

### Auth
Bearer token in header: `Authorization: Bearer {CEIDG_API_TOKEN}`

Token obtained from: https://www.biznes.gov.pl/pl/e-uslugi/00_9999_00

### Response Structure
```json
{
  "firmy": [{
    "nazwa": "Company Name",
    "adresDzialalnosci": {
      "ulica": "Street",
      "budynek": "12",
      "lokal": "3",
      "miasto": "Warsaw",
      "kod": "00-001"
    },
    "wlasciciel": { "nip": "1234563218" },
    "status": "AKTYWNY",
    "dataRozpoczecia": "2020-01-15"
  }],
  "count": 1
}
```

### Important Notes
- CEIDG only contains **sole proprietorships** (JDG) — not LLCs or other company types
- v3 does NOT return email or phone in the response
- Status values: `AKTYWNY`, `Wykreślony`, `Zawieszony`
- Inactive companies should be rejected by default (with `allow_inactive` override)

### Address Building
Build street address by concatenating: `ulica budynek/lokal`
```typescript
let street = address.ulica || '';
if (address.budynek) {
  street += (street ? ' ' : '') + address.budynek;
  if (address.lokal) street += `/${address.lokal}`;
}
```

---

## Pitfalls & Lessons Learned

### 1. Logger MUST write to stderr
MCP stdio transport uses stdout for JSON-RPC messages. **Any log output to stdout breaks the protocol.** Always configure pino with `destination: 2` (stderr).

```typescript
pino.destination({ dest: 2, sync: false })
```

Even in pino-pretty options: `destination: 2`.

### 2. LLMs send null for optional fields
LLMs frequently call tools with `null` values for optional parameters instead of omitting them. Every optional Zod schema must use:
```typescript
z.string().nullish().transform((val) => val || undefined)
```

This `.nullish().transform()` pattern is used on virtually every optional field.

### 3. pino.default() vs pino()
When using ES modules with pino, you may need `pino.default()` instead of `pino()` depending on the version and module resolution. Test this during setup.

### 4. File extensions in imports
With `"module": "Node16"` in tsconfig, all relative imports **must** include `.js` extension:
```typescript
import { config } from './config.js';  // NOT './config' or './config.ts'
```

### 5. Fakturownia API returns arrays at top level
List endpoints return a bare JSON array, NOT `{ data: [...] }`. Handle this:
```typescript
const result = await client.listClients({...});
const clients = Array.isArray(result) ? result : [];
```

### 6. NIP validation with checksum
Polish NIP has a checksum algorithm (weights: 6,5,7,2,3,4,5,6,7). Always validate before sending to API. Clean non-digit characters first.

### 7. Invoice position pricing
Users think in unit prices; Fakturownia API expects total_price_gross per position. The tool MUST do the math: `total_price_gross = unit_price_gross * quantity`.

### 8. get_client_by_nip does client-side filtering
The Fakturownia API's `tax_no` query parameter does exact matching but may not work reliably. The implementation fetches all clients (up to 100) and filters client-side by NIP. This is a known limitation for accounts with 100+ clients.

### 9. Response filtering saves significant tokens
Fakturownia responses include 50+ fields per object. Without filtering, a list of 20 invoices could consume thousands of tokens. The `responseFilter.ts` picks only 8-12 essential fields.

### 10. Retryable errors
`FakturowniaError` carries a `retryable` flag. The API client retries only when `retryable: true` (429, 5xx, network/abort); 401/400/404/422 are not retried.

### 11. Retry with exponential backoff
The API client retries on rate limits (429), server errors (5xx), and network errors. Config: max 3 retries, 1s initial delay, 2x backoff, 10s max delay.

### 12. `sell_date` defaults to `issue_date`
When creating invoices, `sell_date` must be set (Fakturownia may reject without it). Default it to `issue_date`.

### 13. Draft invoices
Fakturownia may not support "draft" status directly — it typically creates invoices as "issued". The `draft` flag is accepted but may be ignored by the API.

### 14. Tool descriptions are LLM prompts
Tool descriptions in MCP are read by LLMs to decide which tool to use. Make them detailed, include workflows, mention defaults, and use CRITICAL/REQUIRES/MUST for important info.

### 15. VAT whitelist `Niezarejestrowany` is not "not found"
Fall back to CEIDG only when `subject` or `subject.name` is null (never VAT-registered). A removed payer still has a name and is a valid whitelist result.

---

## Implementation Sprints

### Sprint 1: Project Setup & Foundation

**Goal**: Buildable, runnable TypeScript project with config and logging.

**Tasks**:
1. `npm init`, set `"type": "module"` in package.json
2. Install dependencies: `@modelcontextprotocol/sdk`, `dotenv`, `pino`, `pino-pretty`, `undici`, `zod`
3. Install dev deps: `typescript`, `@types/node`, `tsx`, `vitest`, `eslint`, `prettier`
4. Configure `tsconfig.json` (ES2022, Node16 module, strict)
5. Configure ESLint and Prettier
6. Create `src/config.ts` — Zod env validation
7. Create `src/logger.ts` — pino to stderr
8. Create `src/utils/errors.ts` — error class hierarchy
9. Create `env.example`
10. Create `.nvmrc` with `20`

**Verification**: `npm run build` succeeds, `npm run type-check` passes.

---

### Sprint 2: Fakturownia API Client

**Goal**: Working HTTP client that can talk to Fakturownia API.

**Tasks**:
1. Create `src/api/endpoints.ts` — all endpoint definitions + query param builder
2. Create `src/api/fakturowniaClient.ts`:
   - Constructor reads config (baseUrl, apiToken, timeout)
   - `makeRequest<T>()` private method with retry logic
   - Error mapping with `FakturowniaError` and `retryable` flag
   - Exponential backoff (1s, 2s, 4s... max 10s, 3 retries)
3. Implement client methods: `healthCheck()`, `listClients()`, `getClient()`, `createClient()`, `updateClient()`, `deleteClient()`
4. Implement invoice methods: `listInvoices()`, `getInvoice()`, `createInvoice()`, `updateInvoice()`, `deleteInvoice()`, `cancelInvoice()`, `downloadInvoicePdf()`, `sendInvoice()`
5. Implement product methods: `listProducts()`, `createProduct()`, `updateProduct()`, `deleteProduct()`

**Key details**:
- API token goes in query params, NOT headers
- All endpoints use `.json` suffix
- Request bodies wrapped in root key (`{ client: {...} }`)
- `listInvoices` MUST send `period=more` + `search_date_type=issue_date` when using date filters

**Verification**: Manual test with `tsx` against real Fakturownia API — `healthCheck()` returns ok.

---

### Sprint 3: Utility Functions

**Goal**: All helper utilities with tests.

**Tasks**:
1. Create `src/utils/nip.ts` — `isValidNIP()`, `cleanNIP()` with checksum validation
2. Create `src/utils/money.ts` — `roundMoney()`, `parseMoney()`, `calculateGrossFromNet()`
3. Create `src/utils/dates.ts` — `formatDate()`, `getToday()`, `get30DaysAgo()`, `addDays()`
4. Create `src/utils/responseFilter.ts` — field picking for clients, invoices (list/detail/created), positions, products
5. Write tests: `tests/utils/nip.test.ts`, `tests/utils/money.test.ts`

**Key detail for responseFilter**: Define constant arrays of field names for each entity type. The `pickFields()` helper skips undefined/null/empty-string values.

**Verification**: `npm test` — all tests pass.

---

### Sprint 4: Zod Schemas

**Goal**: All input validation schemas with null-handling for LLM compatibility.

**Tasks**:
1. Create `src/schemas/common.ts` — pagination, dateString, positiveNumber, email schemas
2. Create `src/schemas/clients.ts`:
   - `getAllClientsInputSchema` (limit with default 100)
   - `getClientByNipInputSchema` (with NIP cleaning + checksum validation)
   - `getClientByNameInputSchema`
   - `createClientInputSchema` (all optional fields use `.nullish().transform()`)
   - `lookupCompanyByNipInputSchema`
   - `updateClientInputSchema`
   - `deleteClientInputSchema` (with confirm boolean)
3. Create `src/schemas/invoices.ts`:
   - `invoicePositionSchema` (with refine: must have net OR gross price)
   - `getInvoicesInputSchema` (defaults: 30 days ago → today)
   - `createInvoiceInputSchema` (auto-calculates due_date = issue_date + 14 days)
   - `updateInvoiceInputSchema`
   - All ID fields accept `z.union([z.string(), z.number()])` (API returns numbers, LLMs may send strings)
4. Create `src/schemas/products.ts`

**Critical pattern** — every optional field:
```typescript
z.string().nullish().transform((val) => val || undefined)
```

**Verification**: `npm run type-check` passes.

---

### Sprint 5: Health & Client Tools

**Goal**: First working MCP tools — health check and all client management.

**Tasks**:
1. Create `src/tools/health.ts` — tool definition + handler
2. Create `src/tools/clients.ts`:
   - Tool definitions (name, description, inputSchema as plain JSON Schema objects)
   - Handler functions: `handleGetAllClients`, `handleGetClientByNip`, `handleGetClientByName`, `handleCreateClient`, `handleUpdateClient`, `handleDeleteClient`
   - Each handler: parse args with Zod → call API client → filter response → return structured result
3. `get_client_by_nip` implementation: fetch all clients (per_page=100), filter client-side by cleaned NIP
4. `get_client_by_name` implementation: fetch all clients, case-insensitive partial match
5. `delete_client`: require `confirm=true`, return warning if not confirmed

**Tool description quality**: Write descriptions as if they're prompts for an LLM. Include what the tool does, when to use it, what inputs look like, what outputs contain.

**Verification**: Manually test tool definitions are valid JSON Schema.

---

### Sprint 6: Invoice Tools

**Goal**: All 8 invoice tools working.

**Tasks**:
1. Create `src/tools/invoices.ts`:
   - `handleGetInvoices` — default last 30 days, filter response
   - `handleGetInvoiceById` — detail view with positions
   - `handleCreateInvoice` — **calculate total_price_gross per position**, set sell_date=issue_date
   - `handleUpdateInvoice` — partial update, map user field names to API names
   - `handleDeleteInvoice` — require confirm=true
   - `handleCancelInvoice` — POST to cancel endpoint
   - `handleDownloadInvoicePdf` — binary download, base64 encode, 5MB limit check
   - `handleMarkInvoiceAsPaid` — POST `/banking/payments.json` (not PUT invoice — KSeF lock)
   - `handleGetClientInvoicesSummary` — fetch all client invoices, aggregate totals/status counts

**Field name mapping** (user → API):
- `due_date` → `payment_to`
- `payment_method` → `payment_type`
- `vat_rate` → `tax`

**Verification**: Create a test invoice via tool, verify on Fakturownia dashboard.

---

### Sprint 7: Product Tools

**Goal**: Product catalog management.

**Tasks**:
1. Create `src/tools/products.ts`:
   - `handleListProducts` — default limit 100
   - `handleCreateProduct` — map fields (unit → quantity_unit)
   - `handleDeleteProduct`
2. Product field mapping: `unit` → `quantity_unit`

**Verification**: List products, create one, delete it.

---

### Sprint 8: CEIDG Integration

**Goal**: Auto-create clients from Polish business registry.

**Tasks**:
1. Create `src/api/ceidgClient.ts`:
   - CEIDG API v3 endpoint: `https://dane.biznes.gov.pl/api/ceidg/v3/firmy`
   - Bearer token auth
   - `CeidgCache` class: in-memory Map with 24h TTL
   - `getCompanyByNip()` — fetch, parse v3 response structure, build address string
   - Handle: no token configured (clear error message), 401/403, 404, network errors
2. Add `handleLookupCompanyByNip` to clients.ts:
   - Validate NIP → fetch from VAT whitelist → CEIDG fallback → return `suggested_create_payload` (no Fakturownia write)
   - Agent calls `create_client` separately after reviewing warnings

**CEIDG v3 response mapping**:
- `company.nazwa` → name
- `company.adresDzialalnosci.ulica` → street
- `company.adresDzialalnosci.budynek` → building number
- `company.adresDzialalnosci.lokal` → apartment number
- `company.adresDzialalnosci.kod` → postal code
- `company.adresDzialalnosci.miasto` → city
- `company.wlasciciel.nip` → NIP
- `company.status` → status
- Email/phone: NOT available in v3 API

**Verification**: Look up a known NIP, verify data matches CEIDG website.

---

### Sprint 9: MCP Server & Stdio Transport

**Goal**: Working MCP server accessible via stdio.

**Tasks**:
1. Create `src/server.ts`:
   - `createMcpServer()` — instantiate Server, register all 25 tools via `ListToolsRequestSchema` and `CallToolRequestSchema`
   - Tool dispatch via handler registry map (`byName.get(name)`)
   - Error handling: catch FakturowniaError → serialize, other errors → generic error response
   - All tool responses: `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`
   - Error responses include `isError: true`
2. Create `src/index.ts`:
   - Entry point with shebang: `#!/usr/bin/env node`
   - Load config, log startup info (without secrets), call `startServer()`
   - `uncaughtException` and `unhandledRejection` handlers
3. `startServer()` — create server, connect `StdioServerTransport`, handle SIGINT/SIGTERM

**Verification**: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js` returns tool list.

---

### Sprint 10: HTTP Server with Streamable HTTP

**Goal**: HTTP-accessible MCP server using Streamable HTTP transport (NOT SSE).

**Tasks**:
1. Create `src/http-server.ts`:
   - Use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`
   - Create HTTP server with `http.createServer()`
   - Endpoints:
     - `GET /` — server info JSON
     - `GET /health` — health check with active session count
     - `POST /mcp` (or whatever the SDK expects) — MCP Streamable HTTP endpoint
   - CORS headers for local testing
   - Session management (SDK handles most of this)
   - Graceful shutdown: close all transports, force exit after 5s timeout
2. Add scripts: `start:http`, `dev:http`
3. Error handlers: uncaughtException, unhandledRejection

**Key difference from SSE**: Streamable HTTP uses a single endpoint. Check the latest SDK docs for the exact API — it may use `StreamableHTTPServerTransport` with a handler function that processes requests.

**Verification**: `curl -X POST http://localhost:3000/mcp` with a tools/list request.

---

### Sprint 11: Docker & Documentation

**Goal**: Production-ready containerization and docs.

**Tasks**:
1. Create `Dockerfile`:
   - Multi-stage: builder (npm ci, tsc) → runtime (node:20-alpine)
   - Non-root user
   - CMD runs HTTP server
   - No EXPOSE needed for stdio mode
2. Create `.dockerignore`
3. Create `env.example` with all variables documented
4. Create `SYSTEM_PROMPT.md` — LLM system prompt for using the tools (see below)
5. Create `README.md` with setup, usage, tool reference
6. Add npm scripts: `build`, `start`, `start:http`, `dev`, `dev:http`, `test`, `lint`, `format`, `type-check`

**Verification**: `docker build -t fakturownia-mcp . && docker run --env-file .env fakturownia-mcp`

---

### Sprint 12: Polish & Edge Cases

**Goal**: Handle all edge cases, improve robustness.

**Tasks**:
1. Test all 25 tools end-to-end against real API
2. Verify error messages are helpful (especially for auth failures, missing config)
3. Test with real LLM client (Claude, etc.) — verify tool descriptions are clear
4. Test CEIDG with various NIPs (active, inactive, non-existent, companies in KRS not CEIDG)
5. Test invoice creation with various position configurations
6. Verify response filtering doesn't drop critical fields
8. Test retry logic with slow/failing API
9. Add any missing edge case handling discovered during testing

---

## LLM System Prompt (SYSTEM_PROMPT.md)

The system prompt should include:
- Language policy (detect user language, keep tool names in English)
- Complete tool inventory with when-to-use guidance
- Critical workflows (create invoice: find client → get ID → create)
- Data format reference (dates, NIP, VAT, currency)
- Rules (search before create, client ID required for invoices, extract IDs from list responses)
- Error handling guidance
- Response style guidance (don't dump raw JSON, summarize, confirm actions)

---

## File-by-File Implementation Notes

### config.ts
- Uses `z.coerce.number()` for numeric env vars (they come as strings)
- `parseConfig()` exits process with clear error if validation fails
- Export singleton: `export const config = parseConfig()`

### logger.ts
- MUST use `pino.destination({ dest: 2, sync: false })` — fd 2 is stderr
- Redact sensitive fields: token, api_token, authorization headers
- pino-pretty only in non-production (check `NODE_ENV`)

### fakturowniaClient.ts
- API token in query params: `{ ...query, api_token: this.apiToken }`
- URL construction: `${baseUrl}${endpoint}${buildQueryParams(allQuery)}`
- Empty response body: return `{} as T` (some DELETE endpoints return empty)

### vatWhitelistClient.ts
- No auth. `date` query param is required (today).
- `mapVatSubject` returns null only when `subject`/`name` is null — not when `statusVat` is `Niezarejestrowany`.
- 429/5xx retried with backoff. Process-local cache keyed by nip+date (MF ~10 req/IP/day).
### responseFilter.ts
- Define field arrays as `const` with `as const`
- `pickFields()` skips undefined, null, and empty string values
- Invoice list vs detail: detail includes positions, sell_date, notes, view_url
- Created invoice response includes view_url (direct link)

### Tool handlers pattern
```typescript
export async function handleToolName(client: FakturowniaApiClient, args: unknown) {
  const input = inputSchema.parse(args);  // Zod validation
  // ... business logic ...
  const result = await client.apiMethod(input.field);
  return { data: filterResponse(result), message: 'Success' };
}
```

---

## npm Scripts

```json
{
  "build": "tsc",
  "start": "node dist/index.js",
  "start:http": "node dist/http-server.js",
  "dev": "tsx src/index.ts",
  "dev:http": "tsx src/http-server.ts",
  "test": "vitest",
  "lint": "eslint src --ext .ts",
  "format": "prettier --write \"src/**/*.ts\"",
  "type-check": "tsc --noEmit"
}
```

---

## Testing Checklist

- [ ] NIP validation (valid, invalid checksum, with dashes, too short/long)
- [ ] Money calculations (net→gross, gross→net, rounding)
- [ ] Config validation (missing required, invalid URL, defaults)
- [ ] Health check (good token, bad token, network error)
- [ ] Client CRUD (create, read, update, delete)
- [ ] Client search (by NIP, by name partial match)
- [ ] CEIDG lookup (valid NIP, not found, inactive, no token)
- [ ] VAT whitelist lookup (active, removed-with-name, never-registered empty shell, 429)
- [ ] Invoice CRUD (create with positions, read, update, delete)
- [ ] Invoice date filtering (verify period=more is sent)
- [ ] Invoice position calculations (net→gross→total)
- [ ] Invoice cancellation
- [ ] Mark as paid (via banking payments, including KSeF-sent invoices)
- [ ] Client summary aggregation
- [ ] Product CRUD
- [ ] Error handling (401, 404, 429, 500, network timeout)
- [ ] Retry logic (retries on 429/5xx, no retry on 400/401)
- [ ] Response filtering (essential fields only)
- [ ] Null handling in Zod schemas
- [ ] Stdio transport (no stdout pollution)
- [ ] HTTP transport (Streamable HTTP)
