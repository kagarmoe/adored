import Link from "next/link";
import { AppLayout } from "@/components/layout";
import { buttonVariants } from "@/components/ui";
import type { TutorialEntry } from "./tutorials";

export interface TutorialStep {
  title: string;
  body: string;
}

interface TutorialArticleProps {
  tutorial: TutorialEntry;
  intro: string;
  steps: readonly TutorialStep[];
  closing: string;
}

export function TutorialArticle({
  tutorial,
  intro,
  steps,
  closing,
}: TutorialArticleProps) {
  return (
    <AppLayout
      breadcrumbs={[
        { label: "Tutorials", href: "/tutorials" },
        { label: tutorial.title },
      ]}
    >
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="space-y-3">
          <h1 className="text-2xl text-ink sm:text-3xl">{tutorial.title}</h1>
          <p className="text-ink-soft">{intro}</p>
        </div>

        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-control border border-rim bg-glass px-4 py-3"
            >
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-content-soft text-sm font-semibold text-ink">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-ink">{step.title}</h2>
                  <p className="text-sm text-ink-soft">{step.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-ink-soft">{closing}</p>

        <Link href="/tutorials" className={`${buttonVariants({ variant: "secondary" })} w-full sm:w-fit`}>
          Back to tutorials
        </Link>
      </article>
    </AppLayout>
  );
}
