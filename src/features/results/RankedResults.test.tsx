// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RankedResults, type RankedJoinedRow } from "./RankedResults";
import type { Item } from "@/types";

function item(id: string, number: number, name: string): Item {
  return { id, collectionId: "coll", number, name, brand: null, status: "active" } as unknown as Item;
}
function row(id: string, computedBucket: any, manualBucket: any = null): RankedJoinedRow {
  return { ri: { id, itemId: id, computedBucket, manualBucket }, item: item(id, Number(id.length), id) };
}
const noCover = () => undefined;

describe("RankedResults — shared hero + ranking + Onward", () => {
  it("gives the first loved row the most-loved hero and lists the rest under the ranking", () => {
    const loved = [row("a", "top"), row("b", "high"), row("c", "medium")];
    render(<RankedResults loved={loved} onward={[]} collectionId="c" coverUrl={noCover} />);
    const hero = screen.getByText("What you love most").closest("a")!;
    expect(hero).toHaveTextContent("a");
    const ranking = screen.getByRole("heading", { name: /the full ranking/i }).closest("section")!;
    expect(within(ranking).getByText("b")).toBeInTheDocument();
    expect(within(ranking).getByText("c")).toBeInTheDocument();
  });

  it("labels ranked rows with the Love/Like/Maybe tier badge", () => {
    const loved = [row("a", "top"), row("b", "high"), row("c", "medium")];
    render(<RankedResults loved={loved} onward={[]} collectionId="c" coverUrl={noCover} />);
    // The tail (b=high→Like, c=medium→Maybe) carries a TierBadge with visible label.
    expect(screen.getByText("Like")).toBeInTheDocument();
    expect(screen.getByText("Maybe")).toBeInTheDocument();
  });

  it("puts low-bucket rows in the forward-framed Onward section, never a count", () => {
    const loved = [row("a", "top")];
    const onward = [row("z", "low")];
    const { container } = render(<RankedResults loved={loved} onward={onward} collectionId="c" coverUrl={noCover} />);
    const section = screen.getByRole("heading", { name: /where these go next/i }).closest("section")!;
    expect(within(section).getByText("z")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/%|\bresult\(s\)\b/);
  });

  it("a manual override to low moves a computed-high row to Onward (effectiveBucket)", () => {
    // Proves the shared component honors the same effectiveBucket a snapshot uses.
    const loved = [row("a", "top")];
    const onward = [row("m", "high", "low")];
    render(<RankedResults loved={loved} onward={onward} collectionId="c" coverUrl={noCover} />);
    const section = screen.getByRole("heading", { name: /where these go next/i }).closest("section")!;
    expect(within(section).getByText("m")).toBeInTheDocument();
  });
});
