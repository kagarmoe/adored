import { describe, it, expect, beforeEach, vi } from "vitest";
import { PreferenceStateService } from "@/server/services/PreferenceStateService";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";
import type { ScoringService } from "@/server/services/ScoringService";
import type { CollectionPreferenceItem } from "@/types";

describe("PreferenceStateService", () => {
  let preferenceRepo: ICollectionPreferenceItemRepository;
  let scoringService: ScoringService;
  let service: PreferenceStateService;

  const mockPreference = (overrides?: Partial<CollectionPreferenceItem>): CollectionPreferenceItem => ({
    id: "pref-1",
    collectionId: "coll-1",
    curatorId: "curator-1",
    itemId: "item-1",
    score: 0.8,
    confidence: 0.9,
    rankBucket: "top",
    comparisonCount: 5,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    preferenceRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByItem: vi.fn(),
      findByCollection: vi.fn(),
      update: vi.fn(),
      clear: vi.fn(),
    };
    scoringService = {
      computeItemPreference: vi.fn(),
      computePreferences: vi.fn(),
    } as any;
    service = new PreferenceStateService(preferenceRepo, scoringService);
  });

  describe("recalculatePreferences", () => {
    it("creates new preferences from scoring", async () => {
      const newPrefs = [
        mockPreference({ id: "new-1", itemId: "item-1" }),
        mockPreference({ id: "new-2", itemId: "item-2" }),
      ];

      vi.mocked(scoringService.computePreferences).mockResolvedValueOnce(newPrefs);
      vi.mocked(preferenceRepo.findByItem).mockResolvedValueOnce(null);
      vi.mocked(preferenceRepo.findByItem).mockResolvedValueOnce(null);
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce(newPrefs);

      const result = await service.recalculatePreferences("coll-1", "curator-1");

      expect(preferenceRepo.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(newPrefs);
    });

    it("updates existing preferences", async () => {
      const newPrefs = [
        mockPreference({ id: "pref-1", score: 0.9 }),
      ];
      const existing = mockPreference({ id: "pref-1", score: 0.7 });

      vi.mocked(scoringService.computePreferences).mockResolvedValueOnce(newPrefs);
      vi.mocked(preferenceRepo.findByItem).mockResolvedValueOnce(existing);
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce(newPrefs);

      await service.recalculatePreferences("coll-1", "curator-1");

      expect(preferenceRepo.update).toHaveBeenCalledWith(
        "pref-1",
        expect.objectContaining({
          score: 0.9,
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe("clearPreferences", () => {
    it("clears all preferences for curator", async () => {
      await service.clearPreferences("coll-1", "curator-1");

      expect(preferenceRepo.clear).toHaveBeenCalledWith("coll-1", "curator-1");
    });
  });

  describe("getPreferenceSummary", () => {
    it("returns summary of preferences", async () => {
      const prefs = [
        mockPreference({ itemId: "item-1", rankBucket: "top", score: 0.9 }),
        mockPreference({ itemId: "item-2", rankBucket: "high", score: 0.7 }),
        mockPreference({ itemId: "item-3", rankBucket: "medium", score: 0.5 }),
      ];

      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce(prefs);

      const result = await service.getPreferenceSummary("coll-1", "curator-1");

      expect(result.totalItems).toBe(3);
      expect(result.averageScore).toBeCloseTo(0.7, 1);
      expect(result.distribution).toEqual({
        top: 1,
        high: 1,
        medium: 1,
        low: 0,
      });
    });

    it("handles empty preferences", async () => {
      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce([]);

      const result = await service.getPreferenceSummary("coll-1", "curator-1");

      expect(result.totalItems).toBe(0);
      expect(result.averageScore).toBe(0);
    });
  });

  describe("getItemPreferences", () => {
    it("returns all preferences for collection and curator", async () => {
      const prefs = [
        mockPreference({ itemId: "item-1" }),
        mockPreference({ itemId: "item-2", rankBucket: "high" }),
      ];

      vi.mocked(preferenceRepo.findByCollection).mockResolvedValueOnce(prefs);

      const result = await service.getItemPreferences("coll-1", "curator-1");

      expect(result).toEqual(prefs);
      expect(preferenceRepo.findByCollection).toHaveBeenCalledWith("coll-1", "curator-1");
    });
  });
});
