import Link from "next/link";
import { Card } from "@/components/ui";
import { TUTORIALS } from "./tutorials";

export function TutorialsList() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {TUTORIALS.map((tutorial) => (
        <Link key={tutorial.slug} href={tutorial.href} className="group block h-full">
          <Card
            interactive
            padding="md"
            className="flex h-full flex-col gap-2 transition-colors group-hover:border-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg text-ink">{tutorial.title}</h2>
            </div>
            <p className="text-sm text-ink-soft">{tutorial.description}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
