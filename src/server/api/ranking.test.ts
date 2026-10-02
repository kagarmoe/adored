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
