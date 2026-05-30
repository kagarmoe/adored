"use client";

import { useState, useEffect } from "react";
import type { Collection, CollectionMembership } from "@/types";
import { apiGet, ApiError } from "@/lib/api-client";

interface UseCollectionResult {
  collection: Collection | null;
  membership: CollectionMembership | null;
  loading: boolean;
  error: ApiError | null;
}

export function useCollection(collectionId: string): UseCollectionResult {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [membership, setMembership] = useState<CollectionMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<Collection>(`/api/collections/${collectionId}`);
        setCollection(data);

        // Try to fetch membership for current user
        try {
          const membershipData = await apiGet<CollectionMembership>(
            `/api/collections/${collectionId}/members/me`
          );
          setMembership(membershipData);
        } catch (err) {
          // If membership endpoint doesn't exist or fails, continue without it
          setMembership(null);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        } else {
          setError(new ApiError(500, "Failed to fetch collection"));
        }
      } finally {
        setLoading(false);
      }
    };

    if (collectionId) {
      fetchCollection();
    }
  }, [collectionId]);

  return { collection, membership, loading, error };
}
