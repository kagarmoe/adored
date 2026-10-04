// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, preferences, dispositions, items, photos, decisions, ranking, sessions } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  preferences: { listItemPreferences: vi.fn() },
  dispositions: { listDispositions: vi.fn() },
  items: { listItems: vi.fn() },
  photos: { findCoverPhotosByItemIds: vi.fn() },
  decisions: { listForCurator: vi.fn() },
  ranking: { listPins: vi.fn() },
  sessions: { listByCollectionAndCurator: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/collections/summer-bags/results",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/preferences", () => ({ PreferenceController: { fromDb: () => preferences } }));
vi.mock("@/server/api/dispositions", () => ({ DispositionController: { fromDb: () => dispositions } }));
vi.mock("@/server/api/items", () => ({ ItemController: { fromDb: () => items } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photos } }));
vi.mock("@/server/api/decisions", () => ({ DecisionController: { fromDb: () => decisions } }));
vi.mock("@/server/api/ranking", () => ({ RankingController: { fromDb: () => ranking } }));
vi.mock("@/server/api/sessions", () => ({ SessionController: { fromDb: () => sessions } }));
// The gate's own behaviour is covered in its tests; here it just mounts the page.
vi.mock("@/features/sorting/PendingDecisionsGate", () => ({ PendingDecisionsGate: ({ children }: { children: React.ReactNode }) => children }));

// The notice slot: present on the ranking, and given no sort (it is no sort's surface).
vi.mock("@/features/sorting/pendingNotices", () => ({
  PendingNotices: (p: { sessionId?: string }) => <div data-testid="notices" data-session={p.sessionId} />,
}));

import RankingPage from "./page";

const COLLECTION = { id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" };
const pref = (itemId: string, rankBucket: string, orderRank: number) => ({
  id: `pref_${itemId}`, collectionId: COLLECTION.id, curatorId: "u1", itemId, score: 0, confidence: 0,
  rankBucket, comparisonCount: 0, orderRank, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date(),
});
const item = (id: string, number: number, name: string) => ({ id, collectionId: COLLECTION.id, number, name, brand: null, status: "active" });
const usage = (id: string, itemId: string, result: "uses" | "not_uses") => ({
  id, sessionId: `sess_${id}`, type: "usage", decision: { itemId, result }, createdAt: new Date(),
});
const disposition = (itemId: string, kind: "deferred" | "set_aside") => ({ itemId, disposition: kind });
const renderPage = async () => render(await RankingPage({ params: Promise.resolve({ id: "summer-bags" }) }));
const section = (name: RegExp) => screen.getByRole("heading", { name }).closest("section")!;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  preferences.listItemPreferences.mockResolvedValue([pref("a", "top", 0), pref("b", "high", 0), pref("d", "low", 0)]);
  items.listItems.mockResolvedValue([item("a", 1, "Alpha"), item("b", 2, "Bravo"), item("d", 4, "Delta"), item("e", 5, "Echo"), item("f", 6, "Foxtrot")]);
  dispositions.listDispositions.mockResolvedValue([disposition("e", "deferred"), disposition("f", "set_aside")]);
  decisions.listForCurator.mockResolvedValue([]);
  photos.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  ranking.listPins.mockResolvedValue([]);
  sessions.listByCollectionAndCurator.mockResolvedValue([]);
});

describe("the live Ranking page (spec §4.3)", () => {
  it("leads with what you love most, then your order, Onward, Still deciding and a collapsed Set aside", async () => {
    ranking.listPins.mockResolvedValue([{ itemId: "b", position: 1, pinnedAt: new Date() }]);
    await renderPage();

    expect(ranking.listPins).toHaveBeenCalledWith("coll_01ABC", "u1");
    // The pin puts Bravo first, so Bravo is the hero and the list leads with it.
    expect(screen.getByText("What you love most").closest("a")).toHaveTextContent("Bravo");
    const order = within(section(/your order/i)).getAllByRole("link").map((l) => l.textContent);
    expect(order).toEqual(["Bravo", "Alpha"]);
    expect(screen.getByRole("button", { name: "Unpin Bravo" })).toBeInTheDocument();
    expect(within(section(/^onward$/i)).getByText("Delta")).toBeInTheDocument();
    expect(within(section(/still deciding/i)).getByText("Echo")).toBeInTheDocument();
    const setAside = screen.getByText("Set aside").closest("details")!;
    expect(setAside).not.toHaveAttribute("open");
    expect(within(setAside).getByText("Foxtrot")).toBeInTheDocument();
    expect(screen.getByTestId("notices")).not.toHaveAttribute("data-session");
    expect(within(setAside).getByRole("button", { name: "Bring back Foxtrot" })).toBeInTheDocument();
  });

  it("keeps the quiet usage note beside the tier on every row", async () => {
    decisions.listForCurator.mockResolvedValue([usage("ev_b", "b", "uses"), usage("ev_d", "d", "not_uses"), usage("ev_e", "e", "uses")]);
    await renderPage();

    expect(within(section(/your order/i)).getByText("Like · In your life")).toBeInTheDocument();
    expect(within(section(/^onward$/i)).getByText("Resting")).toBeInTheDocument();
    expect(within(section(/still deciding/i)).getByText("In your life")).toBeInTheDocument();
  });

  it("offers Save and share (name prefilled with the collection) once something is ranked", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "Save and share" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Keep sorting" })).toHaveAttribute("href", "/collections/summer-bags/sort");
  });

  it("with nothing ranked: the gentle empty state and no Save and share", async () => {
    preferences.listItemPreferences.mockResolvedValue([]);
    dispositions.listDispositions.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText("Nothing to see yet — and that’s fine.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start sorting" })).toHaveAttribute("href", "/collections/summer-bags/sort");
    expect(screen.queryByRole("button", { name: "Save and share" })).toBeNull();
  });

  it("with nothing ranked but a sort open: Keep sorting, not Start", async () => {
    preferences.listItemPreferences.mockResolvedValue([]);
    dispositions.listDispositions.mockResolvedValue([]);
    sessions.listByCollectionAndCurator.mockResolvedValue([{ id: "s1", status: "paused" }]);
    await renderPage();
    expect(sessions.listByCollectionAndCurator).toHaveBeenCalledWith("coll_01ABC", "u1");
    expect(screen.getByRole("link", { name: "Keep sorting" })).toHaveAttribute("href", "/collections/summer-bags/sort");
    expect(screen.queryByRole("link", { name: "Start sorting" })).toBeNull();
  });

  it("DATA-6: the raw curator event log is never serialized into the render", async () => {
    decisions.listForCurator.mockResolvedValue([usage("ev_SECRET_LEAK", "b", "uses"), usage("ev_ANOTHER_LEAK", "d", "not_uses")]);
    const { container } = await renderPage();
    // The usage map is the only payload; event ids and session ids never reach markup.
    expect(container.innerHTML).not.toContain("ev_SECRET_LEAK");
    expect(container.innerHTML).not.toContain("ev_ANOTHER_LEAK");
    expect(container.innerHTML).not.toContain("sess_ev_SECRET_LEAK");
  });
});
