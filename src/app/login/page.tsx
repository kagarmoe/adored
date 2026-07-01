"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, ErrorMessage } from "@/components/ui";
import posthog from "posthog-js";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/collections";

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const result = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        posthog.capture('user_logged_in', { method: 'password' });
        router.push(callbackUrl);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const result = await signIn("email", {
        email: normalizedEmail,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        setMagicLinkSent(true);
      }
    } catch (err) {
      setError("Failed to send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground p-4">
        <div className="max-w-sm w-full bg-surface rounded-card shadow-raised p-8">
          <h1 className="text-2xl text-ink mb-4">Check your email</h1>
          <p className="text-ink-soft mb-4">
            A sign-in link has been sent to <strong>{email}</strong>
          </p>
          <p className="text-ink-soft text-sm mb-6">
            Click the link in the email to sign in. If you don&apos;t see it, check your spam folder.
          </p>
          <Button
            onClick={() => {
              setMagicLinkSent(false);
              setEmail("");
            }}
            variant="secondary"
            fullWidth
          >
            Try a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ground p-4">
      <div className="max-w-sm w-full bg-surface rounded-card shadow-raised p-8">
        <h1 className="text-3xl font-medium tracking-tight text-center text-ink mb-2">
          Adored
        </h1>
        <p className="text-center text-ink-soft mb-8">
          for the things you love
        </p>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handlePasswordSignIn} className="space-y-4 mb-6">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            label="Email"
          />
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            label="Password"
          />
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-hairline"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-surface text-ink-soft">or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={handleMagicLink}
          disabled={loading || !email}
        >
          Email me a magic link
        </Button>

        <p className="text-center text-sm text-ink-soft mt-6">
          New here?{" "}
          <a href="/signup" className="text-primary hover:text-primary-hover font-medium">
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
