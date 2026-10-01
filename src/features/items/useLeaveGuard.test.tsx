// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useLeaveGuard } from "./useLeaveGuard";
function Harness({ active }: { active: boolean }) {
  useLeaveGuard(active);
  return <a href="/collections/x/items">Items</a>;
}
const click = (el: Element) => {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  el.dispatchEvent(ev);
  return ev;
};
afterEach(() => vi.restoreAllMocks());
describe("useLeaveGuard", () => {
  it("while unsaved: blocks an in-app link the person declines to leave by, and warns on unload", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { getByText } = render(<Harness active />);
    expect(click(getByText("Items")).defaultPrevented).toBe(true);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
  it("lets the link through when the person confirms, and does nothing when saved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { getByText, rerender } = render(<Harness active />);
    expect(click(getByText("Items")).defaultPrevented).toBe(false);
    confirm.mockClear();
    rerender(<Harness active={false} />);
    click(getByText("Items"));
    expect(confirm).not.toHaveBeenCalled();
  });
  it("on Back while unsaved: stays put when declined, leaves when confirmed", () => {
    window.history.replaceState(null, "", "/"); // earlier tests left a guard entry
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const push = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<Harness active />);
    expect(push).toHaveBeenCalledTimes(1); // the guard entry Back lands on
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(push).toHaveBeenCalledTimes(2); // declined: re-armed, still here
    confirm.mockReturnValue(true);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
