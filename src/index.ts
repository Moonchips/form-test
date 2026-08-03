import htmlContent from '../index.html';

export interface Env {
  MY_KV_STORE: KVNamespace;
  EMAIL: any;
  TURNSTILE_SECRET_KEY: string; // Map the key from wrangler.toml
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

        // Extract the Turnstile verification token from the payload
        const turnstileToken = formData.get("cf-turnstile-response");
        const clientIp = request.headers.get("CF-Connecting-IP") || "";

        if (!username) {
          return new Response("Missing name field", { status: 400 });
        }

        if (!turnstileToken) {
          return new Response("Security verification token missing.", { status: 400 });
        }

        // --- TURNSTILE VALIDATION LAYER ---
        const verifyBody = new URLSearchParams();
        verifyBody.append("secret", env.TURNSTILE_SECRET_KEY);
        verifyBody.append("response", turnstileToken.toString());
        verifyBody.append("remoteip", clientIp);

        const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body: verifyBody,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        const verificationResult: any = await verifyResponse.json();

        // If Cloudflare detects a bot or modified token, stop execution immediately
        if (!verificationResult.success) {
          return new Response("Spam/Bot submission blocked.", { status: 403 });
        }
        // ----------------------------------

        // Generate a unique key name and write to storage
        const key = `user_${Date.now()}`;
        await env.MY_KV_STORE.put(key, username.toString());

        // Native Cloudflare Email Sending Block
        try {
          await env.EMAIL.send({
            from: "notifications@s31.dev",
            to: "rtingram@gmail.com",
            subject: "🚨 KV Alert: New Form Submission",
            text: `A verified entry was added to your KV store!\n\nKey: ${key}\nUsername: ${username}`
          });
        } catch (emailErr) {
          console.error("Failed to send notification email via binding:", emailErr);
        }

        return new Response("Data successfully saved to KV!", { status: 200 });
      } catch (err) {
        return new Response(`Error saving data: ${err}`, { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
