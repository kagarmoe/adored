// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";
describe("Card", () => {
  it("grid cards carry no backdrop-filter; only the glass panel blurs (spec §5: cheap grids)", () => {
    render(<><Card data-testid="card">a</Card><Card data-testid="glass" variant="glass">b</Card></>);
    const card = screen.getByTestId("card").className;
    const glass = screen.getByTestId("glass").className;
    expect(card).toMatch(/\bbg-card\b/);
    expect(card).not.toMatch(/backdrop-/);
    expect(glass).toMatch(/\bbg-glass-strong\b/);
    expect(glass).toMatch(/\bbackdrop-blur/);
  });
});
