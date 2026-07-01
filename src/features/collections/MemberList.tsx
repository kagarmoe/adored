import type { CollectionMembership, Invitation } from "@/types";
import { Badge } from "@/components/ui";
import { RoleBadge } from "./RoleBadge";

interface MemberListProps {
  members: CollectionMembership[];
  pending?: Invitation[];
  canManage?: boolean;
}

/** First visible character of a name (or email), uppercased, for the avatar. */
function initial(source: string | undefined): string {
  const trimmed = source?.trim() ?? "";
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

const avatarBase =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold";

const rowBase =
  "flex items-center gap-4 rounded-card border border-hairline bg-surface-raised shadow-card px-4 py-3";

export function MemberList({ members, pending = [], canManage = false }: MemberListProps) {
  return (
    <div className="space-y-3">
      {members.map((member) => {
        const isOwner = member.role === "owner";
        const display = member.name?.trim() || member.email || "Member";
        return (
          <div key={member.id} className={rowBase}>
            <span
              aria-hidden="true"
              className={`${avatarBase} ${isOwner ? "bg-content-deeper text-white" : "bg-content-soft text-ink"}`}
            >
              {initial(member.name || member.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{display}</p>
              {member.email && member.name?.trim() && (
                <p className="truncate text-sm text-ink-soft">{member.email}</p>
              )}
            </div>
            <RoleBadge role={member.role} />
            {canManage && !isOwner && (
              <button
                type="button"
                className="flex h-11 items-center rounded-control px-3 text-sm font-medium text-error hover:text-error-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}

      {pending.map((invite) => (
        <div key={invite.id} className={rowBase}>
          <span
            aria-hidden="true"
            className={`${avatarBase} border border-dashed border-hairline text-ink-soft`}
          >
            {"✦"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{invite.email}</p>
            <p className="truncate text-sm text-ink-soft">Invitation sent</p>
          </div>
          <Badge variant="pending">Pending</Badge>
        </div>
      ))}
    </div>
  );
}
