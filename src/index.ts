import htmlContent from '../index.html';

interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export interface Env {
  MY_KV_STORE: KVNamespace;
  EMAIL: EmailBinding;
  TURNSTILE_SECRET_KEY: string;
}

interface TurnstileVerificationResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
  'error-codes'?: string[];
}

interface ContactSubmission {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  message: string;
  source: 'website-contact-form';
  request: {
    clientIp: string | null;
    userAgent: string | null;
  };
  turnstile: {
    hostname: string | null;
    challengeTimestamp: string | null;
    action: string | null;
    cdata: string | null;
  };
}

function getRequiredTextField(
  formData: FormData,
  fieldName: string,
  maxLength: number,
): string {
  const value = formData.get(fieldName);

  if (typeof value !== 'string') {
    throw new Response(`Missing ${fieldName} field.`, { status: 400 });
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Response(`Missing ${fieldName} field.`, { status: 400 });
  }

  if (trimmedValue.length > maxLength) {
    throw new Response(`${fieldName} is too long.`, { status: 400 });
  }

  return trimmedValue;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, POST' },
      });
    }

    try {
      const formData = await request.formData();
      const name = getRequiredTextField(formData, 'name', 100);
      const email = getRequiredTextField(formData, 'email', 254);
      const message = getRequiredTextField(formData, 'message', 4000);

      if (!isValidEmail(email)) {
        return new Response('Invalid e-mail address.', { status: 400 });
      }

      const turnstileToken = formData.get('cf-turnstile-response');
      const clientIp = request.headers.get('CF-Connecting-IP');

      if (typeof turnstileToken !== 'string' || !turnstileToken) {
        return new Response('Security verification token missing.', { status: 400 });
      }

      const verifyBody = new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
      });

      if (clientIp) {
        verifyBody.set('remoteip', clientIp);
      }

      const verifyResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: verifyBody,
        },
      );

      if (!verifyResponse.ok) {
        console.error('Turnstile verification request failed:', verifyResponse.status);
        return new Response('Security verification is temporarily unavailable.', {
          status: 502,
        });
      }

      const verificationResult =
        (await verifyResponse.json()) as TurnstileVerificationResult;

      if (!verificationResult.success) {
        console.warn(
          'Turnstile rejected the submission:',
          verificationResult['error-codes'] ?? [],
        );
        return new Response('Spam/Bot submission blocked.', { status: 403 });
      }

      const submittedAt = new Date().toISOString();
      const id = crypto.randomUUID();
      const key = `contact_${submittedAt.replace(/[:.]/g, '-')}_${id}`;

      const submission: ContactSubmission = {
        id,
        submittedAt,
        name,
        email,
        message,
        source: 'website-contact-form',
        request: {
          clientIp,
          userAgent: request.headers.get('User-Agent'),
        },
        turnstile: {
          hostname: verificationResult.hostname ?? null,
          challengeTimestamp: verificationResult.challenge_ts ?? null,
          action: verificationResult.action ?? null,
          cdata: verificationResult.cdata ?? null,
        },
      };

      // KV values are strings or binary data. Store the complete submission as JSON.
      await env.MY_KV_STORE.put(key, JSON.stringify(submission), {
        metadata: {
          type: submission.source,
          submittedAt,
          name,
          email,
        },
      });

      try {
        await env.EMAIL.send({
          from: 'notifications@s31.dev',
          to: 'rtingram@gmail.com',
          subject: '🚨 KV Alert: New Form Submission',
          text: [
            'A verified contact-form entry was added to your KV store.',
            '',
            `Key: ${key}`,
            `Submitted: ${submittedAt}`,
            `Name: ${name}`,
            `E-mail: ${email}`,
            '',
            'Message:',
            message,
          ].join('\n'),
        });
      } catch (emailError) {
        console.error(
          'The submission was saved, but the notification email failed:',
          emailError,
        );
      }

      return new Response('Message successfully saved.', { status: 200 });
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error('Error saving contact submission:', error);
      return new Response('Unable to save the message.', { status: 500 });
    }
  },
};