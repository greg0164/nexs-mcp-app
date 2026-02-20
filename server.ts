import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;

function setupServer(): McpServer {
    const server = new McpServer({
        name: 'nexs-mcp-app',
        version: '1.0.0',
    });

    const resourceUri = "ui://nexs/spreadsheet-v2.html";

    // Register the conceptual NExS rendering tool
    registerAppTool(server,
        "render_nexs_spreadsheet",
        {
            description: "Renders a live, interactive NExS spreadsheet in the conversation. Use when the user provides a NExS platform URL.",
            inputSchema: {
                app_url: z.string().describe("A published NExS spreadsheet URL (https://platform.nexs.com/...).")
            },
            _meta: { ui: { resourceUri } },
        },
        async ({ app_url }) => {
            return {
                content: [{ type: "text", text: `Render tool executed successfully. Instructed UI to load: ${app_url}.` }],
                structuredContent: { app_url }
            };
        }
    );

    // Register the UI resource that the host will render
    registerAppResource(server,
        "nexs-spreadsheet",
        resourceUri,
        { mimeType: RESOURCE_MIME_TYPE },
        async () => {
            const html = await fs.readFile(
                path.join(__dirname, "dist", "spreadsheet.html"),
                "utf-8"
            );

            return {
                contents: [
                    {
                        uri: resourceUri,
                        mimeType: RESOURCE_MIME_TYPE,
                        text: html,
                        _meta: {
                            ui: {
                                prefersBorder: true,
                                csp: {
                                    connectDomains: ["https://platform.nexs.com"],
                                    resourceDomains: ["https://platform.nexs.com"],
                                    frameDomains: ["https://platform.nexs.com"]
                                },
                            },
                        }
                    } as any
                ],
            };
        }
    );

    return server;
}

async function main() {
    const app = express();
    app.use(cors());

    const transports = new Map<string, SSEServerTransport>();

    // We instantiate the server once and reuse it across sessions in the SSE model
    const mcpServer = setupServer();

    app.get('/mcp', async (_req, res) => {
        const transport = new SSEServerTransport('/mcp/messages', res);

        transports.set(transport.sessionId, transport);
        res.on('close', () => {
            transports.delete(transport.sessionId);
        });

        await mcpServer.server.connect(transport);
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
