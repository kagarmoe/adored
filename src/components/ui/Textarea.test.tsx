// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Textarea } from "./Textarea";

it("associates the label with the control", () => {
  render(<Textarea label="Story" value="" onChange={() => {}} />);
  expect(screen.getByLabelText("Story")).toBeInstanceOf(HTMLTextAreaElement);
});

it("associates the error text and marks the control invalid", () => {
  render(<Textarea label="Story" error="Too long" value="" onChange={() => {}} />);
  const ta = screen.getByLabelText("Story");
  expect(ta.getAttribute("aria-invalid")).toBe("true");
  expect(ta.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("Too long").id).toBe(ta.getAttribute("aria-describedby"));
});
