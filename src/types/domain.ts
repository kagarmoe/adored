// ===== USER =====
export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== COLLECTION =====
export type CollectionStatus = "active" | "archived" | "deleted";

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  status: CollectionStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== COLLECTION MEMBERSHIP =====
export interface CollectionMembership {
  id: string;
  collectionId: string;
  userId: string;
  canManageCollection: boolean;
  canInviteMembers: boolean;
  canAddItems: boolean;
  canEditMetadata: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canSort: boolean;
  canViewOutputs: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ===== INVITATION =====
export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface Invitation {
  id: string;
  collectionId: string;
  email: string;
  token: string;
  canManageCollection: boolean;
  canInviteMembers: boolean;
  canAddItems: boolean;
  canEditMetadata: boolean;
  canAddPhotos: boolean;
  canDeletePhotos: boolean;
  canSort: boolean;
  canViewOutputs: boolean;
  status: InvitationStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
}

// ===== ITEM =====
export interface Item {
  id: string;
  collectionId: string;
  name: string;
  brand: string | null;
  style: string | null;
  color: string | null;
  material: string | null;
  category: string | null;
  status: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== PHOTO =====
export interface Photo {
  id: string;
  itemId: string;
  blobKey: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  uploadedBy: string;
  isHero: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ===== SESSION =====
export type SessionStatus = "active" | "paused" | "completed" | "abandoned" | "deleted";

export interface Session {
  id: string;
  collectionId: string;
  curatorId: string;
  status: SessionStatus;
  goal: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== DECISION EVENT =====
export type DecisionType = "triage" | "pairwise_compare";
export type TriageResult = "top" | "high" | "medium" | "low";
export type PairwiseResult = "item_a" | "item_b" | "tie" | "skip";

export interface DecisionEvent {
  id: string;
  sessionId: string;
  type: DecisionType;
  decision: TriageDecision | PairwiseDecision;
  createdAt: Date;
}

export interface TriageDecision {
  itemId: string;
  result: TriageResult;
}

export interface PairwiseDecision {
  itemAId: string;
  itemBId: string;
  result: PairwiseResult;
}

// ===== COLLECTION PREFERENCE ITEM =====
export type RankBucket = "top" | "high" | "medium" | "low";

export interface CollectionPreferenceItem {
  id: string;
  collectionId: string;
  curatorId: string;
  itemId: string;
  score: number;
  confidence: number;
  rankBucket: RankBucket;
  comparisonCount: number;
  lastSeen: Date;
  updatedAt: Date;
}

// ===== SORT RESULT =====
export type SortResultStatus = "draft" | "finalized";

export interface SortResult {
  id: string;
  collectionId: string;
  curatorId: string;
  status: SortResultStatus;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
}

// ===== SORT RESULT ITEM =====
export interface SortResultItem {
  id: string;
  sortResultId: string;
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
  manualRank: number | null;
  manualBucket: RankBucket | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== SORT RESULT SHARE =====
export type ShareStatus = "active" | "revoked";

export interface SortResultShare {
  id: string;
  sortResultId: string;
  shareToken: string;
  status: ShareStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== API RESPONSE =====
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
