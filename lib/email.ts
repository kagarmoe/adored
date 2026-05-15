import { Resend } from 'resend'

/**
 * Sends a curator an invite-notification email when an operator adds them to a
 * collection. Best-effort: callers invoke this inside a try/catch so a Resend
 * hiccup never blocks adding a curator — the invite/membership row is the
 * source of truth. No-ops when AUTH_RESEND_KEY is unset (dev/test).
 */
export async function sendInviteEmail(
  to: string,
  collectionName: string,
  inviterName: string,
): Promise<void> {
  const key = process.env.AUTH_RESEND_KEY
  if (!key) return

  const resend = new Resend(key)
  await resend.emails.send({
    from: 'PurseInator <onboarding@resend.dev>',
    to,
    subject: `${inviterName} added you to "${collectionName}" on PurseInator`,
    html:
      `<p>${inviterName} added you as a curator of <strong>${collectionName}</strong> on PurseInator.</p>` +
      `<p>Sign in with this email address to start ranking: ` +
      `<a href="https://purseinator-app.vercel.app/login">purseinator-app.vercel.app</a></p>`,
  })
}
