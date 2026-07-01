// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import type { CollectionMembership } from "@/types";
import type { Invitation } from "@/types";
import { MemberList } from "./MemberList";

function membership(over: Partial<CollectionMembership> = {}): CollectionMembership {
  return {
    id: "mem_1",
    collectionId: "col_1",
    userId: "user_1",
    role: "curator",
    name: "Ada Lovelace",
    email: "ada@adored.test",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function invitation(over: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv_1",
    collectionId: "col_1",
    email: "invitee@adored.test",
    token: "SECRET-INVITE-TOKEN-should-never-render",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    acceptedAt: null,
    ...over,
  };
}

describe("MemberList", () => {
  it("shows an accepted member's name, email, and role Badge", () => {
    render(<MemberList members={[membership()]} pending={[]} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@adored.test")).toBeInTheDocument();
    expect(screen.getByText("Curator")).toBeInTheDocument();
  });

  it("shows the owner with an Owner Badge and no Remove control", () => {
    render(
      <MemberList
        members={[membership({ id: "mem_owner", role: "owner", name: "Grace", email: "grace@adored.test" })]}
        pending={[]}
        canManage
      />,
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("offers a Remove control for a curator only when canManage", () => {
    const { rerender } = render(<MemberList members={[membership()]} pending={[]} canManage />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();

    rerender(<MemberList members={[membership()]} pending={[]} canManage={false} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("renders a pending invitation with its email and a pending Badge", () => {
    render(<MemberList members={[]} pending={[invitation()]} />);
    expect(screen.getByText("invitee@adored.test")).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("never renders the invitation token", () => {
    const { container } = render(<MemberList members={[]} pending={[invitation()]} />);
    expect(container.textContent).not.toContain("SECRET-INVITE-TOKEN-should-never-render");
  });

  it("falls back gracefully when an accepted member has no name", () => {
    render(<MemberList members={[membership({ name: undefined, email: "noname@adored.test" })]} pending={[]} />);
    // The email still renders; the row does not crash on a missing name.
    expect(screen.getByText("noname@adored.test")).toBeInTheDocument();
  });

  it("gives a pending invite a distinct avatar glyph, not a member initial", () => {
    render(<MemberList members={[]} pending={[invitation({ email: "zed@adored.test" })]} />);
    // Pending avatars carry the ✦ mark, never the invitee's initial letter.
    expect(screen.getByText("✦")).toBeInTheDocument();
  });
});
