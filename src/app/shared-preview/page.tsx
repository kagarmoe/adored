/*
 * Living design-swatch route (public via the `shared` middleware exclusion).
 * Renders content-rich screens in the "Cabana" palette — espresso chrome on warm
 * parchment, jewel-tone covers — as an at-a-glance reference for the design system.
 * See DESIGN.md. Not part of the product flow; safe to delete if no longer useful.
 */
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const collections = [
  {
    name: "Grandmother's Scarves",
    desc: "Forty years of silk, gathered in one drawer.",
    items: 38,
    date: "May 2026",
    cover: "linear-gradient(135deg, oklch(0.55 0.16 25), oklch(0.4 0.12 18))",
    swatch: "🧣",
    curators: ["RW", "JT"],
  },
  {
    name: "The Reading Chairs",
    desc: "Every chair that ever held a long afternoon.",
    items: 12,
    date: "Apr 2026",
    cover: "linear-gradient(135deg, oklch(0.62 0.1 55), oklch(0.46 0.09 42))",
    swatch: "🪑",
    curators: ["RW"],
    status: "paused" as const,
  },
  {
    name: "Blue & White China",
    desc: "Plates, cups, and the one cracked tureen we keep anyway.",
    items: 54,
    date: "Mar 2026",
    cover: "linear-gradient(135deg, oklch(0.62 0.08 235), oklch(0.48 0.09 248))",
    swatch: "🍵",
    curators: ["RW", "JT", "MK"],
  },
];

function CoverCard({ c }: { c: (typeof collections)[number] }) {
  return (
    <Card interactive padding="none" className="overflow-hidden h-full flex flex-col">
      <div
        className="relative flex h-36 items-center justify-center overflow-hidden"
        style={{ background: c.cover }}
      >
        <span className="text-5xl drop-shadow-sm">{c.swatch}</span>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg leading-tight text-ink">{c.name}</h3>
            {c.status && (
              <Badge variant={c.status} className="shrink-0 capitalize">
                {c.status}
              </Badge>
            )}
          </div>
          <p className="text-sm text-ink-soft">{c.desc}</p>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-sm text-ink-soft">
            <span>{c.items} items</span>
            <span>{c.date}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.curators.map((cur) => (
              <Badge key={cur} variant="curator">
                {cur}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CompareSide({
  label,
  swatch,
  cover,
  meta,
}: {
  label: string;
  swatch: string;
  cover: string;
  meta: string;
}) {
  return (
    <button className="group flex flex-1 flex-col overflow-hidden rounded-card border border-line bg-veil text-left shadow-card transition-all duration-200 ease-gentle hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-espresso focus-visible:ring-offset-2">
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden"
        style={{ background: cover }}
      >
        <span className="text-7xl drop-shadow">{swatch}</span>
      </div>
      <div className="space-y-1 p-5">
        <h3 className="text-xl text-ink">{label}</h3>
        <p className="text-sm text-ink-soft">{meta}</p>
      </div>
    </button>
  );
}

// A thin double-rule serif frame — the Cabana "TRAVEL / DISCOVER NOW" chrome motif.
function RuleLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mx-auto w-fit border-y border-line-strong px-8 py-2 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-ink-soft">{kicker}</p>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <div className="min-h-screen">
      {/* Static chrome (no session dependency) */}
      <header className="sticky top-0 z-40 border-b border-line bg-veil/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="font-display text-2xl text-ink">PurseInator</h1>
          <span className="text-sm text-ink-soft">Rosa Whitfield</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-16 px-6 py-12">
        {/* Collections grid */}
        <section className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-3xl text-ink">Your collections</h2>
              <p className="text-ink-soft">Three rooms, still being sorted.</p>
            </div>
            <Button>New collection</Button>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <CoverCard key={c.name} c={c} />
            ))}
          </div>
        </section>

        {/* Sorting comparison */}
        <section className="space-y-8">
          <RuleLabel kicker="Comparison 14 of 31" title="Which do you love more?" />

          {/* progress */}
          <div className="mx-auto max-w-md space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-vellum-deep">
              <div className="h-full rounded-full bg-espresso" style={{ width: "45%" }} />
            </div>
            <div className="flex justify-between text-xs text-ink-soft">
              <span>14 decided</span>
              <span>17 to go</span>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:flex-row">
            <CompareSide
              label="The paisley silk"
              swatch="🧣"
              cover="linear-gradient(135deg, oklch(0.55 0.16 25), oklch(0.42 0.13 30))"
              meta="Liberty of London · gift from Aunt Edith"
            />
            <CompareSide
              label="The peacock scarf"
              swatch="🦚"
              cover="linear-gradient(135deg, oklch(0.54 0.1 220), oklch(0.45 0.1 240))"
              meta="Bought in Florence, 1981"
            />
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary">They&apos;re equal</Button>
            <Button variant="ghost">Skip for now</Button>
          </div>
        </section>

        {/* Semantic + badge swatches, so every token shows in context */}
        <section className="space-y-4">
          <RuleLabel kicker="Reference" title="The palette in use" />
          <Card className="flex flex-wrap items-center gap-3">
            <Badge variant="top">Love</Badge>
            <Badge variant="high">Cherish</Badge>
            <Badge variant="medium">Keep</Badge>
            <Badge variant="finalized">Finalized</Badge>
            <Badge variant="active">In progress</Badge>
            <Badge variant="deleted">Let go</Badge>
            <span className="ml-2 text-success-deep">Saved</span>
            <span className="text-warning-deep">Unsaved changes</span>
            <span className="text-error-deep">Couldn&apos;t upload</span>
          </Card>
        </section>
      </main>
    </div>
  );
}
