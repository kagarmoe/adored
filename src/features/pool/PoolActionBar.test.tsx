// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoolActionBar, type MoveTarget } from "./PoolActionBar";
import { MAX_GROUP_PHOTOS, POOL_CAP_MESSAGE } from "@/lib/pool-limits";

const TARGETS: MoveTarget[] = [{ id: "i9", number: 9, name: "Red clutch" }];

function renderBar(overrides: Partial<React.ComponentProps<typeof PoolActionBar>> = {}) {
  const props = {
    count: 1,
    busy: false,
    targets: TARGETS,
    onMakeItem: vi.fn(),
    onMakeEach: vi.fn(),
    onMove: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<PoolActionBar {...props} />);
  return props;
}

describe("PoolActionBar", () => {
  it("renders nothing when nothing is selected", () => {
    const { container } = render(
      <PoolActionBar
        count={0}
        busy={false}
        targets={TARGETS}
        onMakeItem={vi.fn()}
        onMove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected count", () => {
    renderBar({ count: 3 });
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it('uses the "Group into an item" label as the primary action', () => {
    renderBar();
    expect(screen.getByRole("button", { name: /group into an item/i })).toBeInTheDocument();
    // Old copy is gone.
    expect(screen.queryByRole("button", { name: /^make an item$/i })).not.toBeInTheDocument();
  });

  it('hides "Make each its own" with one selected, shows it with two', () => {
    const { rerender } = render(
      <PoolActionBar
        count={1}
        busy={false}
        targets={TARGETS}
        onMakeItem={vi.fn()}
        onMakeEach={vi.fn()}
        onMove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /each photo its own item/i })).not.toBeInTheDocument();

    rerender(
      <PoolActionBar
        count={2}
        busy={false}
        targets={TARGETS}
        onMakeItem={vi.fn()}
        onMakeEach={vi.fn()}
        onMove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /each photo its own item/i })).toBeInTheDocument();
  });

  it("opens the Move to… chooser listing New item and existing targets", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: /move to/i }));

    expect(screen.getByRole("button", { name: /new item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /red clutch/i })).toBeInTheDocument();
  });

  it("choosing New item calls onMove with the new destination", async () => {
    const user = userEvent.setup();
    const { onMove } = renderBar();

    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /new item/i }));

    expect(onMove).toHaveBeenCalledWith({ type: "new" });
  });

  it("choosing an existing item calls onMove with that item's id", async () => {
    const user = userEvent.setup();
    const { onMove } = renderBar();

    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /red clutch/i }));

    expect(onMove).toHaveBeenCalledWith({ type: "item", itemId: "i9" });
  });

  it("falls back to #N when a target has no name", async () => {
    const user = userEvent.setup();
    const { onMove } = renderBar({ targets: [{ id: "i4", number: 4, name: null }] });

    await user.click(screen.getByRole("button", { name: /move to/i }));
    await user.click(screen.getByRole("button", { name: /#4/i }));

    expect(onMove).toHaveBeenCalledWith({ type: "item", itemId: "i4" });
  });

  it("shows the cover hint (sm:+) once at least one photo is selected", () => {
    renderBar({ count: 1 });
    const hint = screen.getByText(/the first photo you tapped becomes the cover/i);
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass("hidden", "sm:block");
  });

  it("opening the Move to… chooser is not an action — it calls no callback", async () => {
    const user = userEvent.setup();
    const props = renderBar();

    await user.click(screen.getByRole("button", { name: /move to/i }));

    expect(screen.getByRole("button", { name: /new item/i })).toBeInTheDocument();
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onMakeItem).not.toHaveBeenCalled();
    expect(props.onMakeEach).not.toHaveBeenCalled();
    expect(props.onClear).not.toHaveBeenCalled();
  });

  it('uses short mobile labels "One item" / "One each"', () => {
    renderBar({ count: 2 });
    // Full phrasing still carried by the aria-label for screen readers.
    expect(screen.getByRole("button", { name: /group into an item/i })).toHaveTextContent("One item");
    expect(screen.getByRole("button", { name: /each photo its own item/i })).toHaveTextContent("One each");
  });

  it("shows the cap message and disables Group/Each/Move (not Clear) over the limit", () => {
    renderBar({ count: MAX_GROUP_PHOTOS + 1 });

    expect(screen.getByText(POOL_CAP_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /group into an item/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /each photo its own item/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /move to/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).not.toBeDisabled();
  });

  it("does not show the cap message at or under the limit", () => {
    renderBar({ count: MAX_GROUP_PHOTOS });
    expect(screen.queryByText(POOL_CAP_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /group into an item/i })).not.toBeDisabled();
  });
});
