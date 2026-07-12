// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SortResultShare } from "@/types";
import { SharePanel } from "./SharePanel";

const share: SortResultShare = {
  id: "share_1",
  sortResultId: "result_1",
  shareToken: "tok_1",
  status: "active",
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("SharePanel", () => {
  it("Preview is a single link, not a button nested inside a link (SC 4.1.2)", () => {
    render(<SharePanel resultId="result_1" initialShares={[share]} />);

    const preview = screen.getByRole("link", { name: "Preview" });
    expect(preview.querySelector("button")).toBeNull();
  });
});
