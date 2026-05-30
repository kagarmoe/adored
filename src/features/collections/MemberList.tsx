import type { CollectionMembership } from "@/types";
import { Badge } from "@/components/ui";

interface MemberListProps {
  members: CollectionMembership[];
  canManage?: boolean;
}

export function MemberList({ members, canManage = false }: MemberListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-900">Member</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-900">Role</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-900">Permissions</th>
            {canManage && <th className="text-left px-4 py-3 font-semibold text-gray-900">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{member.name || member.userId}</p>
                  <p className="text-xs text-gray-500">{member.userId}</p>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={member.role === "owner" ? "high" : "medium"}>
                  {member.role === "owner" ? "Owner" : "Curator"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {member.canAddItems && <Badge variant="low">Add items</Badge>}
                  {member.canCreateSession && <Badge variant="low">Sort</Badge>}
                  {member.canViewResults && <Badge variant="low">View results</Badge>}
                  {member.canManageCollection && <Badge variant="medium">Manage</Badge>}
                </div>
              </td>
              {canManage && member.role !== "owner" && (
                <td className="px-4 py-3">
                  <button className="text-red-600 hover:text-red-700 font-medium text-xs">
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
