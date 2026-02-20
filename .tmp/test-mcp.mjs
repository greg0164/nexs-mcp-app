import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ReadResourceResultSchema, ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";

async function main() {
    const transport = new SSEClientTransport(new URL("http://localhost:3001/mcp"));
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);
    console.log("Connected!");

    try {
        console.log("Calling tools/list...");
        const tools = await client.request(
            { method: "tools/list" },
            ListToolsResultSchema
        );
        console.dir(tools, { depth: null });

        console.log("\nCalling tools/call for render_nexs_spreadsheet...");
        const result = await client.request(
            {
                method: "tools/call",
                params: {
                    name: "render_nexs_spreadsheet",
                    arguments: {
                        app_url: "https://platform.nexs.com/app/123"
                    }
                }
            },
            CallToolResultSchema
        );
        console.dir(result, { depth: null });

        console.log("\nCalling readResource for ui://nexs/spreadsheet-v2.html...");
        const resourceResult = await client.request(
            {
                method: "resources/read",
                params: {
                    uri: "ui://nexs/spreadsheet-v2.html"
                }
            },
            ReadResourceResultSchema
        );
        // Dont print the whole HTML text
        if (resourceResult && resourceResult.contents && resourceResult.contents[0]) {
            resourceResult.contents[0].text = "<HTML TEXT HIDDEN>";
        }
        console.dir(resourceResult, { depth: null });
    } catch (err) {
        if (err.issues) {
            fs.writeFileSync("c:\\development\\nexs-mcp-app\\.tmp\\test-error.json", JSON.stringify(err.issues, null, 2));
        } else {
            console.error("MCP Error:", err);
        }
    } finally {
        await client.close();
    }
}
main().catch(console.error);
