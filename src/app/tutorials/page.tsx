import { AppLayout } from "@/components/layout";
import { TutorialsList } from "@/features/tutorials/TutorialsList";

export default function TutorialsPage() {
  return (
    <AppLayout breadcrumbs={[{ label: "Tutorials" }]}>
      <div className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-8">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-2xl text-ink sm:text-3xl">Tutorials</h1>
          <p className="text-ink-soft">
            Revisit any part of Adored when you want a quick refresher.
          </p>
        </div>
        <TutorialsList />
      </div>
    </AppLayout>
  );
}
