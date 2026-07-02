// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { WelcomeGate } from "./WelcomeGate";
import { dismissWelcome } from "./dismissal";
import { installStorage } from "./testStorage";

beforeEach(() => installStorage());
afterEach(() => {
  replace.mockClear();
  localStorage.clear();
});

describe("WelcomeGate", () => {
  it("redirects a zero-collection, not-dismissed user to /welcome", () => {
    render(<WelcomeGate hasCollections={false} />);
    expect(replace).toHaveBeenCalledWith("/welcome");
  });

  it("does not redirect when the walkthrough was dismissed", () => {
    dismissWelcome();
    render(<WelcomeGate hasCollections={false} />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect a user who already has collections", () => {
    render(<WelcomeGate hasCollections={true} />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<WelcomeGate hasCollections={true} />);
    expect(container).toBeEmptyDOMElement();
  });
});
