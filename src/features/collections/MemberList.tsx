import type { CollectionMembership } from "@/types";
import { RoleBadge } from "./RoleBadge";

interface MemberListProps {
  members: CollectionMembership[];
  canManage?: boolean;
}

export function MemberList({ members, canManage = false }: MemberListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-hairline bg-ground">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-ink">Member</th>
            <th className="text-left px-4 py-3 font-semibold text-ink">Role</th>
            {canManage && <th className="text-left px-4 py-3 font-semibold text-ink">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-hairline hover:bg-ground">
              <td className="px-4 py-3">
                {member.name ? (
                  <p className="font-medium text-ink">{member.name}</p>
                ) : (
                  <p className="text-ink-soft">Member</p>
                )}
              </td>
              <td className="px-4 py-3">
                <RoleBadge role={member.role} />
              </td>
              {canManage && member.role !== "owner" && (
                <td className="px-4 py-3">
                  <button className="text-error hover:text-error-deep font-medium text-xs">
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
