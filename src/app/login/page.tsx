"use client";

import { Suspense, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { Button, ErrorMessage } from "@/components/ui";

function LoginContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/collections";

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const { error: socialError } = await signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
      if (socialError) {
        setError(socialError.message ?? "Google sign-in is unavailable right now.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Google sign-in is unavailable right now.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-ground p-4 sm:p-6">
      <div className="w-full max-w-[420px] bg-surface rounded-card shadow-card p-6 sm:p-8">
        <h1 className="font-display font-bold text-[2rem] tracking-tight text-center text-ink mb-2">
          Adored
        </h1>
        <p className="text-center text-ink-soft mb-6 sm:mb-8">
          Find the things you love.
        </p>

        {error && <ErrorMessage message={error} />}

        <Button
          type="button"
          fullWidth
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? "Opening Google..." : "Continue with Google"}
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100svh] flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
