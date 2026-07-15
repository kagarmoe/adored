// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberRemoveButton } from "./MemberRemoveButton";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

describe("MemberRemoveButton", () => {
  it("deletes the member and refreshes the page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemberRemoveButton collectionId="col_1" memberId="mem_1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/col_1/members/mem_1", {
      method: "DELETE",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the page in place and shows an error if remove fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<MemberRemoveButton collectionId="col_1" memberId="mem_1" />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not remove this person just now."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
