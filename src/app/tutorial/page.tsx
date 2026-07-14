import { WalkthroughShell } from "@/features/onboarding/WalkthroughShell";

// Public preview of the first-run walkthrough. It renders the same shell as
// /welcome without auth, DB, or the onboarding gate so the tutorial can be
// shared directly.
export default function TutorialPage() {
  return (
    <main className="min-h-[100svh] bg-ground">
      <WalkthroughShell />
    </main>
  );
}
