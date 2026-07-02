import { Resend } from "resend";
import { env } from "@/lib/env";

// Transactional email via Resend. Two flows: magic-link sign-in and collection
// invitations. Both links carry a bearer token in the URL, so the URL is a
// secret — it goes ONLY to the recipient's send, and is NEVER logged, captured,
// or echoed anywhere outside NODE_ENV==="development".
//
// Graceful fallback (mirrors the PostHog no-token stub in posthog-server.ts):
// if RESEND_API_KEY is unset we do NOT construct a client and do NOT throw —
// sends are skipped so CI/tests/local stay green without a key. In development
// only, we console.log the link so a dev can click it locally.

type SendArgs = { to: string; url: string };

// Cache the client so we build it once. `null` = key unset (fallback mode).
let client: Resend | null = null;
let resolved = false;

function getClient(): Resend | null {
  if (resolved) return client;
  resolved = true;
  const key = process.env.RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  return client;
}

async function send(args: {
  to: string;
  subject: string;
  html: string;
  devLabel: string;
  url: string;
}): Promise<void> {
  const resend = getClient();

  if (!resend) {
    // No key: no-op. Surface the link only for local dev clicking — never in
    // test/production, so the bearer token never lands in shared logs.
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV ${args.devLabel}] ${args.to}\n${args.url}`);
    }
    return;
  }

  // Recipient scoped to `to` only — no cc/bcc, so the token-bearing link never
  // reaches a second address.
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
  });

  if (error) {
    // Never include the url/token in the thrown error or any log.
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export async function sendMagicLink({ to, url }: SendArgs): Promise<void> {
  await send({
    to,
    url,
    devLabel: "MAGIC LINK",
    subject: "Your sign-in link for Adored",
    html: magicLinkHtml(url),
  });
}

export async function sendInvitation({ to, url }: SendArgs): Promise<void> {
  await send({
    to,
    url,
    devLabel: "INVITATION",
    subject: "You've been invited to a collection on Adored",
    html: invitationHtml(url),
  });
}

function magicLinkHtml(url: string): string {
  return `
    <p>Tap the link below to sign in to Adored. It expires shortly and can be used once.</p>
    <p><a href="${url}">Sign in to Adored</a></p>
    <p>If you didn't request this, you can ignore this email.</p>
  `;
}

function invitationHtml(url: string): string {
  return `
    <p>You've been invited to share a collection on Adored.</p>
    <p><a href="${url}">Open your invitation</a></p>
    <p>If you weren't expecting this, you can ignore this email.</p>
  `;
}
