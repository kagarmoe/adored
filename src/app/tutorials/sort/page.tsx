import { WalkthroughShell } from "@/features/onboarding/WalkthroughShell";

// Public preview of the completed sort tutorial. It renders the same shell as
// /welcome without auth, DB, or the onboarding gate so the tutorial can be
// shared directly.
export default function SortTutorialPage() {
  return (
    <main className="min-h-[100svh]">
      <WalkthroughShell />
    </main>
  );
}
