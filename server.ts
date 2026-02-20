import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ErrorCode,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

function setupServer(server: Server) {
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
                    _meta: {
                        "ui/resourceUri": "ui://nexs/spreadsheet-v2.html",
                        ui: { resourceUri: "ui://nexs/spreadsheet-v2.html" }
                    }
                }
            ]
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "render_nexs_spreadsheet") {
            const args = request.params.arguments || {};
            const app_url = (args as any).app_url || "unknown url";
            return {
                content: [{ type: "text", text: `Render tool executed successfully. Instructed UI to load: ${app_url}. Arguments received: ${JSON.stringify(args)}` }]
            };
        }
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: [
                {
                    uri: "ui://nexs/spreadsheet-v2.html",
                    name: "nexs-spreadsheet",
                    mimeType: RESOURCE_MIME_TYPE
                }
            ]
        };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === "ui://nexs/spreadsheet-v2.html") {
            const html = await fs.readFile(
                path.join(__dirname, "dist", "spreadsheet.html"),
                "utf-8"
            );
            return {
                contents: [
                    {
                        uri: "ui://nexs/spreadsheet-v2.html",
                        mimeType: RESOURCE_MIME_TYPE,
                        text: html,
                        _meta: {
                            ui: {
                                prefersBorder: true,
                                csp: {
                                    connectDomains: ["https://platform.nexs.com"],
                                    resourceDomains: ["https://platform.nexs.com", "'unsafe-inline'"]
                                },
                            },
                        },
                    } as any
                ],
            };
        }
        throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${request.params.uri}`);
    });
}

async function main() {
    const app = express();
    app.use(cors());

    const transports = new Map<string, SSEServerTransport>();

    app.get('/mcp', async (_req, res) => {
        const transport = new SSEServerTransport('/mcp/messages', res);

        const server = new Server(
            { name: 'nexs-mcp-app', version: '1.0.0' },
            { capabilities: { tools: {}, resources: {} } }
        );
        setupServer(server);

        transports.set(transport.sessionId, transport);
        res.on('close', () => {
            transports.delete(transport.sessionId);
        });

        await server.connect(transport);
    });

    app.post('/mcp/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports.get(sessionId);

        if (transport) {
            await transport.handlePostMessage(req, res);
        } else {
            res.status(404).send('Session not found. Please connect to /mcp first.');
        }
    });

    app.listen(PORT, () => {
        console.log(`NExS MCP App server listening on http://localhost:${PORT}/mcp`);
    });
}

main().catch(console.error);
