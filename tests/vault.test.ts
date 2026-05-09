import { describe, expect, it } from "vitest";
import type { CookieSnapshot } from "../src/shared/types";
import {
  createInitialState,
  decryptCookieSnapshot,
  encryptCookieSnapshot,
  unlockState
} from "../src/security/vault";

describe("vault", () => {
  it("encrypts cookie snapshots without storing plaintext values", async () => {
    const { key } = await createInitialState();
    const snapshot: CookieSnapshot = {
      capturedAt: "2026-05-09T00:00:00.000Z",
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "very-secret-cookie-value",
          domain: ".chatgpt.com",
          hostOnly: false,
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          expirationDate: 1_800_000_000,
          session: false,
          storeId: "0"
        }
      ]
    };

    const encrypted = await encryptCookieSnapshot(key, snapshot);
    const serialized = JSON.stringify(encrypted);

    expect(serialized).not.toContain("very-secret-cookie-value");

    await expect(decryptCookieSnapshot(key, encrypted)).resolves.toEqual(snapshot);
  });

  it("rejects invalid local vault keys", async () => {
    const { state } = await createInitialState();

    await expect(unlockState({ ...state, vault: { ...state.vault, keySeed: "" } })).rejects.toThrow();
  });
});
