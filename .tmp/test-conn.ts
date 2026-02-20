import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import fetch from "node-fetch";

// The SDK relies on EventSource globally.
import EventSource from "eventsource";
(global as any).EventSource = EventSource;

async function main() {
    console.log("Connecting to Render...");
    const url = new URL("https://nexs-mcp-app.onrender.com/mcp");
    const transport = new SSEClientTransport(url);
    const client = new Client({ name: "test", version: "1.0.0" });

    await client.connect(transport);
    console.log("Connected to Render!");

    try {
        console.log("Calling tools/list...");
        const result = await client.request({ method: "tools/list" }, {} as any);
        console.dir(result, { depth: null });

        console.log("Calling resources/list...");
        const resList = await client.request({ method: "resources/list" }, {} as any);
        console.dir(resList, { depth: null });
    } catch (err) {
        console.error("Error calling endpoint");
        console.dir(err, { depth: null });
    } finally {
        await client.close();
    }
}
main().catch(console.error);
