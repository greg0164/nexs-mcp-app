import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";

const root = document.getElementById("app-root")!;

const app = new App({ name: "NExS Viewer", version: "1.0.0" });

let targetUrl: string | null = null;
const debugLogs: any[] = [];

app.ontoolinput = (params) => {
  debugLogs.push({ hook: 'ontoolinput', data: params });
  const args = params.arguments as any;
  if (args && typeof args.app_url === 'string') {
    targetUrl = args.app_url;
  }
};

app.ontoolresult = (result) => {
  debugLogs.push({ hook: 'ontoolresult', data: result });

  if (!targetUrl) {
    if (result && result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === "text" && block.text) {
          const match = block.text.match(/https:\/\/platform\.nexs\.com\/app\/[\w-]+/);
          if (match) {
            targetUrl = match[0];
            break;
          }
        }
      }
    }
  }

  // Fallback to checking the raw arguments just in case
  if (!targetUrl && (result as any).arguments?.app_url) {
    targetUrl = (result as any).arguments.app_url;
  }

  if (!targetUrl) {
    root.innerHTML = `
      <div style="padding: 16px; font-family: monospace; font-size: 13px; background: #0d0d0d; color: #00ff00; height: 100%; overflow: auto; box-sizing: border-box;">
        <h3 style="color: #ff3333; margin-top: 0;">Error: Could not extract URL from payload</h3>
        <p>Please share a screenshot of the logs below with the developer:</p>
        <pre style="white-space: pre-wrap; word-break: break-all;">${JSON.stringify(debugLogs, null, 2)}</pre>
      </div>`;
    return;
  }

  root.innerHTML = `<div style="padding-top:92.9%;position:relative;width:100%">
    <iframe src="${targetUrl}" style="position:absolute;left:0;top:0;width:100%;height:100%;border:0" allowfullscreen></iframe>
  </div>`;
};

app.connect(new PostMessageTransport(window.parent)).then(() => {
  console.log("App connected successfully.");
}).catch(console.error);
