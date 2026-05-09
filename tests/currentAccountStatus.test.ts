import { describe, expect, it } from "vitest";
import {
  createCookieSnapshotFingerprint,
  createCookieSnapshotIdentityFingerprint
} from "../src/session/currentAccountStatus";
import type { CookieSnapshot } from "../src/shared/types";

describe("current account status helpers", () => {
  it("fingerprints matching cookie snapshots without depending on expiration order", async () => {
    const first = createSnapshot([
      {
        name: "b",
        value: "2",
        domain: ".chatgpt.com",
        path: "/",
        expirationDate: 1_800_000_000
      },
      {
        name: "a",
        value: "1",
        domain: ".chatgpt.com",
        path: "/"
      }
    ]);
    const second = createSnapshot([
      {
        name: "a",
        value: "1",
        domain: ".chatgpt.com",
        path: "/",
        expirationDate: 1_900_000_000
      },
      {
        name: "b",
        value: "2",
        domain: ".chatgpt.com",
        path: "/"
      }
    ]);

    await expect(createCookieSnapshotFingerprint(first)).resolves.toBe(
      await createCookieSnapshotFingerprint(second)
    );
  });

  it("changes fingerprint when a managed cookie value changes", async () => {
    const first = createSnapshot([{ name: "session", value: "old" }]);
    const second = createSnapshot([{ name: "session", value: "new" }]);

    await expect(createCookieSnapshotFingerprint(first)).resolves.not.toBe(
      await createCookieSnapshotFingerprint(second)
    );
  });

  it("keeps the identity fingerprint stable when non-auth cookies change", async () => {
    const first = createSnapshot([
      { name: "__Secure-next-auth.session-token", value: "same-session" },
      { name: "_dd_s", value: "first-ui-cookie" }
    ]);
    const second = createSnapshot([
      { name: "__Secure-next-auth.session-token", value: "same-session" },
      { name: "_dd_s", value: "second-ui-cookie" }
    ]);

    await expect(createCookieSnapshotIdentityFingerprint(first)).resolves.toBe(
      await createCookieSnapshotIdentityFingerprint(second)
    );
  });

  it("changes the identity fingerprint when a core auth cookie changes", async () => {
    const first = createSnapshot([
      { name: "__Secure-next-auth.session-token", value: "old-session" }
    ]);
    const second = createSnapshot([
      { name: "__Secure-next-auth.session-token", value: "new-session" }
    ]);

    await expect(createCookieSnapshotIdentityFingerprint(first)).resolves.not.toBe(
      await createCookieSnapshotIdentityFingerprint(second)
    );
  });
});

function createSnapshot(
  cookies: Array<Partial<CookieSnapshot["cookies"][number]>>
): CookieSnapshot {
  return {
    capturedAt: "2026-05-09T00:00:00.000Z",
    cookies: cookies.map((cookie) => ({
      name: "session",
      value: "secret",
      domain: ".chatgpt.com",
      hostOnly: false,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      session: true,
      storeId: "0",
      ...cookie
    }))
  };
}
