# NExS Spreadsheet MCP App — Architecture Design

## Overview

This document describes the architecture for an MCP App that renders live, interactive NExS spreadsheets directly inside AI chat interfaces (Claude Web, Claude Desktop, VS Code, and other MCP Apps–capable hosts). The approach uses the official **MCP Apps extension** (SEP-1865), which is the standard for embedding interactive HTML UIs inside MCP host conversations.

The core idea: a user asks Claude to show a spreadsheet, and the NExS worksheet appears inline in the chat — fully interactive, with all calculation logic handled natively by the NExS platform.

---

## Design Assumptions

### Target Environment

The MCP App renders in any host that supports the MCP Apps extension. The primary targets are **Claude Web** and **Claude Desktop**, but the same server works unmodified with VS Code (Insiders), Goose, Postman, and any future MCP Apps–capable client.

### Delegated Calculations (Zero AI Math)

The AI acts strictly as an intelligent concierge. It never performs spreadsheet logic or manipulates cells via API calls. Once the NExS UI renders in-conversation, the embedded NExS worksheet handles all user interactions, state management, and proprietary calculations natively and autonomously.

### Transport

The MCP server exposes an HTTP endpoint using `StreamableHTTPServerTransport` from the MCP TypeScript SDK. For local development, the server runs on `localhost` and is exposed via a secure tunnel (e.g., Cloudflare Tunnel) so Claude Web can reach it. Claude Desktop can also connect directly via stdio for local use.

### Authentication (MVP)

To simplify the initial build, the MCP server authenticates with `auth.nexs.com` using a single global service account (the developer's testing account). Multi-tenant OAuth routing is deferred to a later phase.

### Spreadsheet Discovery

The MCP server discovers available spreadsheets via the NExS REST API (`GET /api/v1/apps/`). WebSocket-based push notifications are deferred.

### Embedding & Security

The MCP Apps sandbox renders the UI HTML inside a strict, host-controlled iframe. To embed NExS platform content within that sandbox, the MCP App declares `frameDomains` in its CSP metadata, whitelisting the NExS platform origin. The NExS platform must allow iframe embedding from the host's sandbox origin (i.e., its `X-Frame-Options` or `frame-ancestors` CSP must permit it).

> **Note:** MCP Apps hosts apply a deny-by-default CSP. External origins for scripts, fetch requests, and nested iframes must be explicitly declared in the resource's `_meta.ui.csp` configuration. The host enforces these declarations — the app cannot override them at runtime.

---

## Architecture

The design uses three MCP primitives working together: a **Resource** (context for the AI), a **Tool** (the trigger), and a **UI Resource** (the interactive HTML payload).

```
┌──────────────────────────────────────┐
│         NExS MCP App UI              │  Sandboxed iframe in chat
│   (HTML + JS, embeds NExS iframe)    │
└──────────────────┬───────────────────┘
                   │ postMessage (JSON-RPC)
┌──────────────────▼───────────────────┐
│         MCP Host (Claude)            │  Renders UI, routes messages
└──────────────────┬───────────────────┘
                   │ MCP Protocol (HTTP / stdio)
┌──────────────────▼───────────────────┐
│         NExS MCP Server              │  Tools, Resources, NExS API calls
└──────────────────┬───────────────────┘
                   │ REST API
┌──────────────────▼───────────────────┐
│         NExS Cloud Platform          │  Spreadsheet engine & data
└──────────────────────────────────────┘
```

### 1. Context Resource — Spreadsheet Discovery

Gives the AI silent awareness of which spreadsheets exist in the connected NExS account, so it can resolve user intent without requiring pasted URLs.

| Property     | Value                          |
|--------------|--------------------------------|
| Resource URI | `nexs://apps/list`             |
| Backend call | `GET /api/v1/apps/` (global service account token) |
| Returns      | Formatted text listing each app's name, UUID, and published URL |

The AI uses this list to match natural-language requests ("Show me the TenXTL Reference Example") to specific spreadsheet URLs.

### 2. Tool — `render_nexs_spreadsheet`

The tool the AI calls when it determines the user wants to view or interact with a spreadsheet. Its `_meta.ui` field links to the UI resource, telling the host to render the interactive view.

**Tool registration:**

```typescript
registerAppTool(
  server,
  "render_nexs_spreadsheet",
  {
    title: "Render NExS Spreadsheet",
    description:
      "Renders a live, interactive NExS spreadsheet directly in the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        app_url: {
          type: "string",
          description: "The published NExS spreadsheet URL.",
        },
      },
      required: ["app_url"],
    },
    _meta: {
      ui: { resourceUri: "ui://nexs/spreadsheet-embed.html" },
    },
  },
  async ({ app_url }) => {
    return {
      content: [
        { type: "text", text: `Launching NExS spreadsheet: ${app_url}` },
      ],
      structuredContent: { app_url },
    };
  }
);
```

Key details:

- `_meta.ui.resourceUri` points to the UI resource the host will fetch and render.
- `structuredContent` passes `app_url` as typed data to the UI, which is cleaner than parsing it out of a text blob.
- The host may **preload** the UI resource before the tool is even called, so rendering can start immediately.

### 3. UI Resource — The Interactive Embed

When the host sees the `_meta.ui` reference, it fetches this resource and renders the returned HTML inside a sandboxed iframe.

**Resource registration:**

```typescript
registerAppResource(
  server,
  "nexs-spreadsheet-embed",
  "ui://nexs/spreadsheet-embed.html",
  {
    mimeType: RESOURCE_MIME_TYPE, // "text/html;profile=mcp-app"
  },
  async () => {
    const html = await fs.readFile(
      path.join(import.meta.dirname, "dist", "spreadsheet-embed.html"),
      "utf-8"
    );
    return {
      contents: [
        {
          uri: "ui://nexs/spreadsheet-embed.html",
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                frameDomains: ["https://platform.nexs.com"],
              },
            },
          },
        },
      ],
    };
  }
);
```

Key details:

- `frameDomains` declares the NExS platform origin so the sandbox allows the nested iframe. Without this, the embed is blocked by the host's deny-by-default CSP.
- `prefersBorder: true` tells the host to render a visible border around the app, which is appropriate for an embedded spreadsheet.
- The HTML is bundled into a single file at build time using Vite + `vite-plugin-singlefile`.

**UI HTML payload** (`spreadsheet-embed.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    .container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8f9fa;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .loading { color: #6b7280; font-size: 14px; }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
    }
  </style>
</head>
<body>
  <div class="container" id="app-root">
    <p class="loading">Loading NExS spreadsheet…</p>
  </div>
  <script type="module" src="/src/spreadsheet-embed.ts"></script>
</body>
</html>
```

**UI script** (`src/spreadsheet-embed.ts`):

```typescript
import { App } from "@modelcontextprotocol/ext-apps";

const root = document.getElementById("app-root")!;

const app = new App({
  name: "NExS Spreadsheet Viewer",
  version: "1.0.0",
});

// Handle the tool result pushed by the host after tool invocation
app.ontoolresult = (result) => {
  const data = result.structuredContent as { app_url?: string };
  const url = data?.app_url;

  if (!url || !url.startsWith("https://platform.nexs.com/")) {
    root.innerHTML = `<p class="loading">Invalid or missing spreadsheet URL.</p>`;
    return;
  }

  // Mount the NExS iframe
  root.innerHTML = `<iframe src="${url}" allowfullscreen></iframe>`;
};

// Establish communication with the host
app.connect();
```

Key details:

- Uses the official `App` class from `@modelcontextprotocol/ext-apps` — not raw `postMessage` listeners.
- Validates the URL origin before embedding to prevent injection.
- `app.ontoolresult` fires when the host delivers the tool result. The handler is registered **before** `app.connect()` so the initial result isn't missed.
- The NExS iframe loads directly from `platform.nexs.com`, which handles all spreadsheet rendering and calculation natively.

---

## End-to-End User Flow

1. **Setup.** The NExS MCP server runs locally (or remotely). For Claude Web, it's exposed via Cloudflare Tunnel and added as a custom connector under Settings → Connectors → Add Custom Connector.

2. **Discovery.** The user types: *"Show me the TenXTL Reference Example."*

3. **Resolution.** Claude reads the `nexs://apps/list` resource, identifies the matching spreadsheet URL, and calls `render_nexs_spreadsheet` with that URL.

4. **Rendering.** The host fetches the `ui://nexs/spreadsheet-embed.html` resource and renders the HTML in a sandboxed iframe inline in the conversation.

5. **Data handoff.** The host delivers the tool result (containing `app_url` in `structuredContent`) to the UI via the MCP Apps postMessage protocol.

6. **Interaction.** The UI script extracts the URL and mounts the NExS platform iframe. The spreadsheet appears inside the chat — the user can input data, change parameters, trigger calculations, and download results. All computation is handled by NExS with zero latency from the AI layer.

7. **Continued conversation.** Claude remains available in the same thread to answer follow-up questions, explain results, or trigger additional spreadsheets.

---

## Project Structure

```
nexs-mcp-app/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server.ts                          # MCP server: tools + resources
├── spreadsheet-embed.html             # UI entry point (HTML shell)
├── src/
│   └── spreadsheet-embed.ts           # UI logic (App class, iframe mounting)
└── dist/                              # Build output (single-file HTML bundle)
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server, transports |
| `@modelcontextprotocol/ext-apps` | `registerAppTool`, `registerAppResource`, `App` class |
| `express`, `cors` | HTTP server for StreamableHTTP transport |
| `vite`, `vite-plugin-singlefile` | Bundle UI into single HTML file |
| `tsx` | Run TypeScript server directly |

---

## Open Questions & Future Work

- **`frameDomains` review scrutiny.** The MCP Apps spec notes that apps declaring `frameDomains` receive higher scrutiny during directory review and may be rejected from broad distribution. For initial use as a custom connector this is fine, but directory submission may require an alternative approach (e.g., fetching spreadsheet data via API and rendering natively in the UI rather than embedding an iframe).

- **Multi-tenant OAuth.** Replace the global service account with per-user Salesforce OAuth so different users see their own NExS workspaces.

- **Bidirectional data flow.** Use `app.callServerTool()` from the UI to let the embedded spreadsheet push results back to the AI context — for example, surfacing calculation outputs as structured data so Claude can reason about them.

- **NExS `X-Frame-Options` / `frame-ancestors`.** Confirm the NExS platform allows embedding from the host's sandbox origin. If not, the platform team needs to update its response headers.

- **Real-time discovery.** Replace REST polling with WebSocket push from `push.nexs.com` so the app list stays current without repeated API calls.
