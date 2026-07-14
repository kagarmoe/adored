import { Resend } from "resend";
import { env } from "@/lib/env";

// Transactional email via Resend. Invitation links carry a bearer token in the
// URL, so the URL is a secret — it goes ONLY to the recipient's send, and is
// NEVER logged, captured, or echoed anywhere outside NODE_ENV==="development".
//
// Graceful fallback: if RESEND_API_KEY is unset we do NOT construct a client and do NOT throw —
// sends are skipped so CI/tests/local stay green without a key. In development
// only, we console.log the link so a dev can click it locally.

type InvitationArgs = { to: string; token: string };

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

// `buildUrl` is a thunk so the caller can defer any env access (e.g. AUTH_URL)
// until AFTER the no-op guard below — the no-key path must never touch env vars
// that the send doesn't need. `html` is built from the resolved url, so it too
// is deferred past the guard.
async function send(args: {
  to: string;
  subject: string;
  devLabel: string;
  buildUrl: () => string;
  html: (url: string) => string;
}): Promise<void> {
  const resend = getClient();

  if (!resend) {
    // No key: no-op. Surface the link only for local dev clicking — never in
    // test/production, so the bearer token never lands in shared logs.
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV ${args.devLabel}] ${args.to}\n${args.buildUrl()}`);
    }
    return;
  }

  const url = args.buildUrl();

  // Recipient scoped to `to` only — no cc/bcc, so the token-bearing link never
  // reaches a second address.
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html(url),
  });

  if (error) {
    // Never include the url/token in the thrown error or any log.
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export async function sendInvitation({ to, token }: InvitationArgs): Promise<void> {
  // Build the invite URL INSIDE the send, after the no-op guard, so a missing
  // RESEND_API_KEY (which no-ops) never forces env.AUTH_URL to be present.
  await send({
    to,
    devLabel: "INVITATION",
    subject: "You've been invited to a collection on Adored",
    buildUrl: () => `${env.AUTH_URL}/invitations/${token}`,
    html: invitationHtml,
  });
}

function invitationHtml(url: string): string {
  return `
    <p>You've been invited to share a collection on Adored.</p>
    <p><a href="${url}">Open your invitation</a></p>
    <p>If you weren't expecting this, you can ignore this email.</p>
  `;
}
