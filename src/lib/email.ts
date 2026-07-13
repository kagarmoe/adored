import { Resend } from "resend";
import { env } from "@/lib/env";

// Transactional email via Resend. Two flows: magic-link sign-in and collection
// invitations. Both links carry a bearer token in the URL, so the URL is a
// secret — it goes ONLY to the recipient's send, and is NEVER logged, captured,
// or echoed anywhere outside NODE_ENV==="development".
//
// A MISSING KEY IS A BROKEN SEND, NOT A FEATURE. This file used to call that a
// "graceful fallback": no key -> skip the send -> return void -> the caller
// reports success. That silence hid a 65-day PRODUCTION outage of magic-link
// sign-in AND every collection invitation, because Vercel held the key under the
// legacy name AUTH_RESEND_KEY while this code read RESEND_API_KEY (purses-3i5s).
// Now: the key is read under EITHER name, and a send with no key THROWS.
//
// Not sending is still legitimate — but it must be CHOSEN, never inferred from
// an absent variable. Set EMAIL_TRANSPORT=noop (e2e does; production must not).
// In development we print the link instead, so a dev can click it locally.

type SendArgs = { to: string; url: string };
type InvitationArgs = { to: string; token: string };

// Cache the client so we build it once. `null` = key unset (fallback mode).
let client: Resend | null = null;
let resolved = false;

function getClient(): Resend | null {
  if (resolved) return client;
  resolved = true;
  // Accept the legacy Auth.js-era name too: Vercel still holds the working key
  // as AUTH_RESEND_KEY, and reading only RESEND_API_KEY is exactly how email
  // went dark in production. Canonical name first; legacy as the fallback.
  const key = process.env.RESEND_API_KEY ?? process.env.AUTH_RESEND_KEY;
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
  // Explicitly chosen silence (e2e, and any environment that deliberately does
  // not send). This is the ONLY sanctioned no-op path — it requires someone to
  // have set the variable on purpose, so a missing key can never masquerade as
  // a deliberate choice.
  //
  // Validated strictly: "none"/"off"/"false" are the plausible typos, and under a
  // loose check they would fall straight past this branch and SEND FOR REAL. A
  // variable whose only job is to suppress email must never fail open.
  const transport = process.env.EMAIL_TRANSPORT;
  if (transport !== undefined && transport !== "" && transport !== "noop") {
    throw new Error(
      `EMAIL_TRANSPORT="${transport}" is not a valid value. The only sanctioned value is "noop".`,
    );
  }
  if (transport === "noop") return;

  const resend = getClient();

  if (!resend) {
    // Local dev without a key: print the link so a dev can click it. The URL is
    // a bearer token, so this happens ONLY in development — never where a log
    // could be shared.
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV ${args.devLabel}] ${args.to}\n${args.buildUrl()}`);
      return;
    }
    // Anywhere else, refuse to pretend. The caller (and the person waiting for
    // the email) is entitled to know the send did not happen.
    throw new Error(
      "Email is not configured: neither RESEND_API_KEY nor AUTH_RESEND_KEY is set, " +
        "and EMAIL_TRANSPORT=noop was not chosen. Refusing to silently drop an email.",
    );
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

export async function sendMagicLink({ to, url }: SendArgs): Promise<void> {
  // NextAuth supplies the url — no env.AUTH_URL access here.
  await send({
    to,
    devLabel: "MAGIC LINK",
    subject: "Your sign-in link for Adored",
    buildUrl: () => url,
    html: magicLinkHtml,
  });
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
