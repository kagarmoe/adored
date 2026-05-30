import { Checkbox } from "@/components/ui";

interface PermissionCheckboxesProps {
  values: {
    canAddItems: boolean;
    canDeleteItems: boolean;
    canAddPhotos: boolean;
    canDeletePhotos: boolean;
    canInviteMembers: boolean;
    canManageCollection: boolean;
    canCreateSession: boolean;
    canViewResults: boolean;
  };
  onChange: (key: string, value: boolean) => void;
  disabled?: boolean;
}

const permissionDescriptions: Record<string, { label: string; description: string }> = {
  canAddItems: {
    label: "Add items",
    description: "Create new items in this collection",
  },
  canDeleteItems: {
    label: "Delete items",
    description: "Remove items from the collection",
  },
  canAddPhotos: {
    label: "Upload photos",
    description: "Add photos to items",
  },
  canDeletePhotos: {
    label: "Delete photos",
    description: "Remove photos from items",
  },
  canInviteMembers: {
    label: "Invite members",
    description: "Send invitations to new curators",
  },
  canManageCollection: {
    label: "Manage collection",
    description: "Edit collection settings and members",
  },
  canCreateSession: {
    label: "Create sorting sessions",
    description: "Start new item sorting sessions",
  },
  canViewResults: {
    label: "View results",
    description: "See sorting results and rankings",
  },
};

export function PermissionCheckboxes({ values, onChange, disabled = false }: PermissionCheckboxesProps) {
  return (
    <div className="space-y-4">
      {Object.entries(permissionDescriptions).map(([key, { label, description }]) => (
        <div key={key} className="space-y-2">
          <Checkbox
            id={key}
            label={label}
            checked={values[key as keyof typeof values]}
            onChange={(e) => onChange(key, e.target.checked)}
            disabled={disabled}
          />
          <p className="text-xs text-gray-600 ml-9">{description}</p>
        </div>
      ))}
    </div>
  );
}
