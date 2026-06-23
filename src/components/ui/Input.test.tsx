// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("associates the visible label with the input (queryable by label text)", () => {
    render(<Input label="Display name" value="" onChange={() => {}} />);
    // Fails today: no htmlFor/id, so getByLabelText finds nothing.
    expect(screen.getByLabelText("Display name")).toBeInstanceOf(HTMLInputElement);
  });

  it("links an explicit id when provided", () => {
    render(<Input id="name" label="Name" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Name");
    expect(input.id).toBe("name");
  });

  it("associates the error text and marks the control invalid", () => {
    render(<Input label="Name" error="Required" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("Required").id);
  });
});
