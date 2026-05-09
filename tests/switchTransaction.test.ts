import { describe, expect, it } from "vitest";
import type { CookieSnapshot } from "../src/shared/types";
import { runSwitchTransaction } from "../src/session/switchTransaction";

const snapshot: CookieSnapshot = {
  capturedAt: "2026-05-09T00:00:00.000Z",
  cookies: []
};

describe("switch transaction", () => {
  it("backs up before deleting and applying target cookies", async () => {
    const order: string[] = [];

    await runSwitchTransaction({
      captureCurrent: async () => {
        order.push("capture");
        return snapshot;
      },
      persistRollback: async () => {
        order.push("persistRollback");
      },
      deleteManaged: async () => {
        order.push("deleteManaged");
      },
      applyTarget: async () => {
        order.push("applyTarget");
      },
      refreshTabs: async () => {
        order.push("refreshTabs");
      }
    });

    expect(order).toEqual([
      "capture",
      "persistRollback",
      "deleteManaged",
      "applyTarget",
      "refreshTabs"
    ]);
  });

  it("keeps rollback persisted when applying target fails", async () => {
    const order: string[] = [];

    await expect(
      runSwitchTransaction({
        captureCurrent: async () => {
          order.push("capture");
          return snapshot;
        },
        persistRollback: async () => {
          order.push("persistRollback");
        },
        deleteManaged: async () => {
          order.push("deleteManaged");
        },
        applyTarget: async () => {
          order.push("applyTarget");
          throw new Error("set failed");
        },
        refreshTabs: async () => {
          order.push("refreshTabs");
        }
      })
    ).rejects.toThrow("set failed");

    expect(order).toEqual([
      "capture",
      "persistRollback",
      "deleteManaged",
      "applyTarget"
    ]);
  });
});
