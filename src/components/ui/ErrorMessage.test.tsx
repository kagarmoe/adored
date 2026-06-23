// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorMessage } from "./ErrorMessage";

describe("ErrorMessage", () => {
  it("announces via an assertive alert role", () => {
    render(<ErrorMessage message="Boom" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Boom");
  });

  it("lets a caller override the role via props", () => {
    render(<ErrorMessage message="Boom" role="status" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Boom");
  });
});
