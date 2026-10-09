import type { CollectionMembership, Invitation } from "@/types";
import { Badge } from "@/components/ui";
import { RoleBadge } from "./RoleBadge";
import { MemberRemoveButton } from "./MemberRemoveButton";
import { CopyInviteLinkButton } from "./CopyInviteLinkButton";

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
  "flex items-center gap-4 rounded-card border border-rim bg-glass shadow-card px-4 py-3";

export function MemberList({ members, pending = [], canManage = false }: MemberListProps) {
  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const isOwner = member.role === "owner";
        const display = member.name?.trim() || member.email || "Member";
        return (
          <li key={member.id} className={rowBase}>
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
              <MemberRemoveButton collectionId={member.collectionId} memberId={member.id} />
            )}
          </li>
        );
      })}

      {pending.map((invite) => (
        <li key={invite.id} className={rowBase}>
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
          {canManage && <CopyInviteLinkButton token={invite.token} />}
        </li>
      ))}
    </ul>
  );
}
