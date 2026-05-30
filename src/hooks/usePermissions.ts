import type { CollectionMembership } from "@/types";

export interface DerivedPermissions {
  canAddItems: boolean;
  canDeleteItems: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canInviteMembers: boolean;
  canManageCollection: boolean;
  canCreateSession: boolean;
  canViewResults: boolean;
  isOwner: boolean;
}

export function usePermissions(membership: CollectionMembership | null | undefined): DerivedPermissions {
  if (!membership) {
    return {
      canAddItems: false,
      canDeleteItems: false,
      canAddPhotos: false,
      canDeletePhotos: false,
      canInviteMembers: false,
      canManageCollection: false,
      canCreateSession: false,
      canViewResults: false,
      isOwner: false,
    };
  }

  const isOwner = membership.role === "owner";

  return {
    canAddItems: isOwner || membership.canAddItems,
    canDeleteItems: isOwner || membership.canDeleteItems,
    canAddPhotos: isOwner || membership.canAddPhotos,
    canDeletePhotos: isOwner || membership.canDeletePhotos,
    canInviteMembers: isOwner || membership.canInviteMembers,
    canManageCollection: isOwner || membership.canManageCollection,
    canCreateSession: isOwner || membership.canSort,
    canViewResults: isOwner || membership.canViewOutputs,
    isOwner,
  };
}
