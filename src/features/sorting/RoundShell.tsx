"use client";

import type { ReactNode } from "react";

interface RoundShellProps {
  /** 1-based current step. */
  step: 1 | 2 | 3;
  totalSteps: number;
  roundLabel: string;
  /** The round's timer chrome (e.g. <RoundTimer />), rendered in the header. */
  timer?: ReactNode;
  /** When given, a quiet Pause action appears. */
  onPause?: () => void;
  children: ReactNode;
}

/**
 * The round surface header: a step indicator (completed steps carry a ✓ so the state is
 * never colour alone), the round label, an optional timer slot, and a quiet Pause action,
 * then the round content. Tap targets are ≥44px; tokens only.
 */
export function RoundShell({ step, totalSteps, roundLabel, timer, onPause, children }: RoundShellProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <ol
            className="flex items-center gap-2"
            role="list"
            aria-label={`Round progress: step ${step} of ${totalSteps}`}
          >
            {steps.map((n) => {
              const completed = n < step;
              const current = n === step;
              return (
                <li
                  key={n}
                  aria-current={current ? "step" : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                    completed
                      ? "border-decor bg-decor/20 text-ink"
                      : current
                        ? "border-ink bg-surface text-ink"
                        : "border-hairline bg-surface text-ink-soft"
                  }`}
                >
                  {completed ? <span aria-hidden>✓</span> : <span aria-hidden>{n}</span>}
                </li>
              );
            })}
          </ol>

          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex h-11 items-center rounded-control px-3 text-sm text-ink-soft transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            >
              Pause
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="sr-only">
              Step {step} of {totalSteps}
            </p>
            <h2 className="text-ink">{roundLabel}</h2>
          </div>
          {timer && <div className="min-w-[10rem] flex-1 sm:max-w-xs">{timer}</div>}
        </div>
      </header>

      {children}
    </div>
  );
}
