// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { StartSortingButton } from "./StartSortingButton";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StartSortingButton", () => {
  it("POSTs {collectionId} only, then redirects straight to triage on 201", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 201,
        json: async () => ({ id: "sess_01ABC", number: 7 }),
      }),
    );
    render(<StartSortingButton collectionId="coll_01ULID" collectionSlug="summer-bags" />);
    fireEvent.click(screen.getByRole("button", { name: "Start sorting" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/summer-bags/sort/7/triage"));

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ collectionId: "coll_01ULID" });
  });

  it("on 409 shows the gentle resuming line and refreshes, without navigating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 409, json: async () => ({ error: "conflict" }) }),
    );
    render(<StartSortingButton collectionId="c" collectionSlug="s" />);
    fireEvent.click(screen.getByRole("button", { name: "Start sorting" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your sort is already open — resuming is one tap away.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("disables the button while the request is in flight", async () => {
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<StartSortingButton collectionId="c" collectionSlug="s" />);
    const button = screen.getByRole("button", { name: "Start sorting" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveFetch({ status: 201, json: async () => ({ number: 1 }) });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("shows the gentle generic-error line on other failures and re-enables the button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500, json: async () => ({ error: "boom" }) }),
    );
    render(<StartSortingButton collectionId="c" collectionSlug="s" />);
    const button = screen.getByRole("button", { name: "Start sorting" });
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "That didn't go through — give it another try in a moment.",
      ),
    );
    expect(button).not.toBeDisabled();
  });
});
