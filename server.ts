import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

async function main() {
    const server = new Server(
        {
            name: 'nexs-mcp-app',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "render_nexs_spreadsheet",
                    description: "Renders a live, interactive NExS spreadsheet in the conversation. Use when the user provides a NExS platform URL.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            app_url: {
                                type: "string",
                                description: "A published NExS spreadsheet URL (https://platform.nexs.com/...).",
                            },
                        },
                        required: ["app_url"],
                    },
                }
            ]
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "render_nexs_spreadsheet") {
            const args = request.params.arguments as any;
            const app_url = args.app_url;
            return {
                content: [{ type: "text", text: `Rendering spreadsheet: ${app_url}` }],
                // Injecting _meta and structuredContent to work with ext-apps UI rendering proxy
                _meta: {
                    ui: { resourceUri: "ui://nexs/spreadsheet.html" }
                },
                structuredContent: { app_url }
            } as any;
        }
        throw new Error(`Tool not found: ${request.params.name}`);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: "ui://nexs/spreadsheet.html",
                    name: "nexs-spreadsheet",
                    mimeType: RESOURCE_MIME_TYPE
                }
            ]
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === "ui://nexs/spreadsheet.html") {
            const html = await fs.readFile(
                path.join(__dirname, "dist", "spreadsheet.html"),
                "utf-8"
            );
            return {
                contents: [
                    {
                        uri: "ui://nexs/spreadsheet.html",
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
                    } as any
                ],
            };
        }
        throw new Error(`Resource not found: ${request.params.uri}`);
    });

    const app = express();
    app.use(cors());

    let transport: SSEServerTransport;

    app.get('/mcp', async (_req, res) => {
        transport = new SSEServerTransport('/mcp/messages', res);
        await server.connect(transport);
    });

    app.post('/mcp/messages', async (req, res) => {
        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(400).send('No active session. Please connect to /mcp first.');
        }
    });

    app.listen(PORT, () => {
        console.log(`NExS MCP App server listening on http://localhost:${PORT}/mcp`);
    });
}

main().catch(console.error);
