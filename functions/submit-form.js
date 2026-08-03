// functions/submit-form.js (or your existing KV handler file)
export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const name = formData.get('name');
    const email = formData.get('email');
    const id = crypto.randomUUID();

    // 1. Your existing logic: Save to KV
    await context.env.YOUR_KV_NAMESPACE.put(id, JSON.stringify({ name, email }));

    // 2. New logic: Send email notification via MailChannels
    const sendEmailResponse = await fetch('https://mailchannels.net', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'your-personal@email.com', name: 'Admin' }] }],
        from: { email: 'notifications@yourdomain.com', name: 'Form Bot' },
        subject: 'New KV Form Submission Alert',
        content: [{
          type: 'text/plain',
          value: `A new entry was added to KV.\n\nID: ${id}\nName: ${name}\nEmail: ${email}`,
        }],
      }),
    });

    if (!sendEmailResponse.ok) {
      // Handle email failure log internally so your user still gets a success screen
      console.error('Email failed to send');
    }

    return new Response('Form submitted successfully!', { status: 200 });
  } catch (err) {
    return new Response(err.toString(), { status: 500 });
  }
}
