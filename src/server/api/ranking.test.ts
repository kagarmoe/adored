import { describe, expect, it, vi } from "vitest";
import { RankingController } from "./ranking";
import type { SortResultService } from "@/server/services/SortResultService";

const pinItem = vi.fn().mockResolvedValue(undefined);
const controller = new RankingController({ pinItem } as unknown as SortResultService);

describe("RankingController.pin body", () => {
  it.each([[{ position: 0 }], [{ position: 1.5 }], [{ position: 1, extra: true }], [{}]])(
    "rejects %j before any write",
    (body) => {
      expect(() => controller.pin("c", "u", "i", body)).toThrow();
      expect(pinItem).not.toHaveBeenCalled();
    },
  );

  it("passes a valid 1-based position through", async () => {
    await controller.pin("c", "u", "i", { position: 3 });
    expect(pinItem).toHaveBeenCalledWith("c", "u", "i", 3);
  });
});

const saveAndShare = vi.fn();
const saver = new RankingController({ saveAndShare } as unknown as SortResultService);
const KEY = "01j00000000000000000000000";

describe("RankingController.save body", () => {
  it.each([[{ name: "   ", saveKey: KEY }], [{ name: "x", saveKey: "not-a-ulid" }], [{ name: "x" }], [{ name: "x", saveKey: KEY, extra: 1 }]])(
    "rejects %j before any write",
    (body) => {
      expect(() => saver.save("c", "u", body)).toThrow();
      expect(saveAndShare).not.toHaveBeenCalled();
    },
  );
});
