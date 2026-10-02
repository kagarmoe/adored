// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverflowMenu } from "./OverflowMenu";

function setup() {
  const onArchive = vi.fn();
  render(
    <OverflowMenu
      label="More for this item"
      items={[
        { label: "Archive", onSelect: onArchive },
        { label: "Delete", onSelect: vi.fn(), tone: "danger" },
      ]}
    />,
  );
  return { trigger: screen.getByRole("button", { name: "More for this item" }), onArchive };
}

describe("OverflowMenu", () => {
  it("opens on the first item, walks with arrows, and Escape closes back to the trigger", async () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("choosing an item closes the menu and runs it; a tap outside just closes", async () => {
    const { trigger, onArchive } = setup();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
