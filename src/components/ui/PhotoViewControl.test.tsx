// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PhotoViewControl } from "./PhotoViewControl";

const photo = {
  id: "p1",
  itemId: "i1",
  collectionId: "c1",
  rotation: 0,
  updatedAt: new Date(1_700_000_000_000).toISOString(),
};

describe("PhotoViewControl", () => {
  it("shows a labelled view control and opens the viewer on tap", async () => {
    const user = userEvent.setup();
    render(<PhotoViewControl photo={photo} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /view photo/i });
    await user.click(btn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
