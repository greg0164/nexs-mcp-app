import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";

const root = document.getElementById("app-root")!;

const app = new App({ name: "NExS Viewer", version: "1.0.0" });

app.ontoolresult = (result) => {
  let url: string | null = null;
  if (result && result.content && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === "text" && block.text) {
        const match = block.text.match(/https:\/\/platform\.nexs\.com\/app\/[\w-]+/);
        if (match) {
          url = match[0];
          break;
        }
      }
    }
  }

  if (!url) {
    root.innerHTML = `<p class="loading">No spreadsheet URL provided.</p>`;
    return;
  }

  root.innerHTML = `<div style="padding-top:92.9%;position:relative;width:100%">
    <iframe src="${url}" style="position:absolute;left:0;top:0;width:100%;height:100%;border:0" allowfullscreen></iframe>
  </div>`;
};

app.connect(new PostMessageTransport(window.parent)).then(() => {
  console.log("App connected successfully.");
}).catch(console.error);
