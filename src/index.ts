// Import your HTML file text directly if using Wrangler bundled assets,
// or embed your HTML structure inside a template string variable.
import htmlContent from './index.html';

export interface Env {
  // This must match the binding name you choose in your wrangler.toml
  MY_KV_STORE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Serve the HTML Form on GET requests
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. Handle Form Submission on POST requests
    if (request.method === "POST") {
      try {
        const formData = await request.formData();
        const username = formData.get("username");

        if (!username) {
          return new Response("Missing name field", { status: 400 });
        }

        // Generate a unique key name (e.g., user_1718465000)
        const key = `user_${Date.now()}`;

        // Save the form text value into Cloudflare KV
        await env.MY_KV_STORE.put(key, username.toString());

        return new Response("Data successfully saved to KV!", { status: 200 });
      } catch (err) {
        return new Response(`Error saving data: ${err}`, { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
