"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Button, Input, ErrorMessage } from "@/components/ui";
import posthog from "posthog-js";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password || !passwordConfirm) {
      setError("All fields are required");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();
      // better-auth requires a name; the form doesn't collect one, so seed it
      // from the email local-part (the same value the Header falls back to for
      // display). The user can edit it later on the profile screen.
      const derivedName = normalizedEmail.split("@")[0];
      const { error: signUpError } = await signUp.email({
        email: normalizedEmail,
        password,
        name: derivedName,
      });

      if (signUpError) {
        setError(signUpError.message || "Signup failed. Please try again.");
      } else {
        // signUp.email also establishes the session, so no separate sign-in.
        posthog.capture('user_signed_up');
        router.push("/collections");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ground p-4">
      <div className="max-w-sm w-full bg-surface rounded-card shadow-raised p-8">
        <h1 className="text-3xl font-medium tracking-tight text-center text-ink mb-2">
          Create account
        </h1>
        <p className="text-center text-ink-soft mb-8">
          Join Adored to start curating
        </p>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSignup} className="space-y-4">
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
          <Input
            type="password"
            placeholder="••••••••"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            disabled={loading}
            label="Confirm password"
          />
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-ink-soft mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-primary hover:text-primary-hover font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
