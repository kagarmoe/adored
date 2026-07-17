// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { apiGet, apiPost, push, useSessionMock } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  useSessionMock: vi.fn(),
}));

let currentToken = "tok_1";

vi.mock("@/lib/api-client", () => ({ apiGet, apiPost }));
vi.mock("@/lib/auth-client", () => ({ useSession: useSessionMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ token: currentToken }),
}));

import InvitationPage from "./page";

const PREVIEW = {
  collectionName: "Summer bags",
  collectionDescription: "Everything warm-weather.",
  inviterName: "Tessa Torres",
  invitedEmail: "friend@adored.test",
  status: "pending" as const,
};

function renderPage(token = "tok_1") {
  currentToken = token;
  return render(<InvitationPage />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("InvitationPage", () => {
  it("renders the shaped preview: heading, collection card, inviter line, promise line, capability line", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
    apiGet.mockResolvedValue(PREVIEW);

    renderPage();

    await waitFor(() => expect(screen.getByText("Summer bags")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "You're invited!" })).toBeInTheDocument();
    expect(screen.getByText("Everything warm-weather.")).toBeInTheDocument();
    expect(
      screen.getByText("Tessa Torres invited you to help sort this collection."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You'll sort it your own way — your choices never overwrite anyone else's."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You'll be able to add photos, name things, and sort."),
    ).toBeInTheDocument();
  });

  it("omits the inviter line when inviterName is null", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
    apiGet.mockResolvedValue({ ...PREVIEW, inviterName: null });

    renderPage();

    await waitFor(() => expect(screen.getByText("Summer bags")).toBeInTheDocument());
    expect(screen.queryByText(/invited you to help sort this collection/)).not.toBeInTheDocument();
  });

  it("signed in: shows 'Accept invitation' and accepting routes to the collection returned by the POST response", async () => {
    const user = userEvent.setup();
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
    apiGet.mockResolvedValue(PREVIEW);
    apiPost.mockResolvedValue({ message: "Invitation accepted successfully", collectionId: "col_9" });

    renderPage("tok_1");
    await waitFor(() => expect(screen.getByText("Summer bags")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/api/invitations/accept?token=tok_1", {}),
    );
    expect(push).toHaveBeenCalledWith("/collections/col_9");
  });

  it("signed out: renders 'Sign in to accept' linking to /login?callbackUrl=/invitations/{token} instead of the Accept button", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    apiGet.mockResolvedValue(PREVIEW);

    renderPage("tok_1");
    await waitFor(() => expect(screen.getByText("Summer bags")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "Sign in to accept" });
    expect(signIn).toHaveAttribute("href", "/login?callbackUrl=/invitations/tok_1");
  });

  it("'Not now' routes home", async () => {
    const user = userEvent.setup();
    useSessionMock.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false });
    apiGet.mockResolvedValue(PREVIEW);

    renderPage();
    await waitFor(() => expect(screen.getByText("Summer bags")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows an error state for a bad/expired token", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });
    apiGet.mockRejectedValue(new Error("Invitation not found or expired"));

    renderPage();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Invitation not found or expired")).toBeInTheDocument();
  });
});
