import { Badge } from "@/components/ui";

interface RoleBadgeProps {
  role: "owner" | "curator" | string;
}

// Roles are identity, not a value-ramp: each maps to its own role Badge variant,
// never the tier tokens. Any non-owner role is shown as Curator.
export function RoleBadge({ role }: RoleBadgeProps) {
  const isOwner = role === "owner";
  return (
    <Badge variant={isOwner ? "owner" : "curator"}>{isOwner ? "Owner" : "Curator"}</Badge>
  );
}
