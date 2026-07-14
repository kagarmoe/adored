import { notFound } from "next/navigation";
import { WalkthroughShell } from "@/features/onboarding/WalkthroughShell";

// Dev-only preview of the first-run walkthrough, so the owner can hot-edit it
// locally without logging in. It renders the SAME shell as /welcome — no auth,
// no DB, no onboarding gate. In production it 404s: the guard below is the real
// security boundary (the middleware change only skips the dev login redirect),
// so this never ships as a reachable route.
export default function TutorialPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <main className="min-h-[100svh] bg-ground">
      <WalkthroughShell />
    </main>
  );
}
