// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Textarea } from "./Textarea";

it("associates the label with the control", () => {
  render(<Textarea label="Story" value="" onChange={() => {}} />);
  expect(screen.getByLabelText("Story")).toBeInstanceOf(HTMLTextAreaElement);
});

it("links an explicit id when provided", () => {
  render(<Textarea id="story" label="Story" value="" onChange={() => {}} />);
  expect(screen.getByLabelText("Story").id).toBe("story");
});

it("associates the error text and marks the control invalid", () => {
  render(<Textarea label="Story" error="Too long" value="" onChange={() => {}} />);
  const ta = screen.getByLabelText("Story");
  expect(ta.getAttribute("aria-invalid")).toBe("true");
  expect(ta.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("Too long").id).toBe(ta.getAttribute("aria-describedby"));
});

it("grows to fit a filled value instead of clipping it", () => {
  const spy = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(132);
  render(<Textarea label="Story" value={"a long story\n".repeat(6)} onChange={() => {}} />);
  expect((screen.getByLabelText("Story") as HTMLTextAreaElement).style.height).toBe("132px");
  spy.mockRestore();
});
