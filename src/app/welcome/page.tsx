import { WalkthroughShell } from "@/features/onboarding/WalkthroughShell";

// The first-run walkthrough. Self-contained and client-only (the shell holds
// all state) — no DB, no auth gate here; that trigger is a separate task.
export default function WelcomePage() {
  return (
    <main className="min-h-[100svh] bg-ground">
      <WalkthroughShell />
    </main>
  );
}
