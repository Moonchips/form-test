export async function onRequestPost(context) {
    try {
        const input = await context.request.json();
        const timestamp = new Date().toISOString();
        const id = `submission_${timestamp}`;

        // Assumes you have bound a KV namespace named 'FORM_DATA' in your Cloudflare dashboard
        if (context.env.FORM_DATA) {
            await context.env.FORM_DATA.put(id, JSON.stringify(input));
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
