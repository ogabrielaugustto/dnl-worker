import { env } from "../../config/env.js";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

function getNormalizedAppUrl() {
  return env.PLATFORM_URL.replace(/\/$/, "");
}

export function getAppUrl() {
  return getNormalizedAppUrl();
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo ?? env.RESEND_REPLY_TO_EMAIL,
    }),
  });

  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  throw new Error(payload?.error?.message ?? `Resend request failed with status ${response.status}`);
}
