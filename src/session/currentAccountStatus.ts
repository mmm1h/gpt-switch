import type { CookieSnapshot } from "../shared/types";

export async function createCookieSnapshotFingerprint(
  snapshot: CookieSnapshot
): Promise<string> {
  return createFingerprint(snapshot.cookies);
}

export async function createCookieSnapshotIdentityFingerprint(
  snapshot: CookieSnapshot
): Promise<string> {
  const coreCookies = snapshot.cookies.filter(isCoreAuthCookie);

  if (coreCookies.length === 0) {
    return "";
  }

  return createFingerprint(coreCookies);
}

async function createFingerprint(
  cookies: CookieSnapshot["cookies"]
): Promise<string> {
  if (cookies.length === 0) {
    return "";
  }

  const normalized = cookies
    .map((cookie) => ({
      storeId: cookie.storeId ?? "",
      domain: cookie.domain,
      path: cookie.path,
      name: cookie.name,
      value: cookie.value,
      partitionKey: stableStringify(cookie.partitionKey ?? null)
    }))
    .sort((left, right) =>
      [
        left.storeId,
        left.domain,
        left.path,
        left.name,
        left.partitionKey
      ]
        .join("|")
        .localeCompare(
          [
            right.storeId,
            right.domain,
            right.path,
            right.name,
            right.partitionKey
          ].join("|")
        )
    );

  const input = new TextEncoder().encode(JSON.stringify(normalized));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isCoreAuthCookie(cookie: CookieSnapshot["cookies"][number]): boolean {
  const name = cookie.name.toLowerCase();

  return (
    name.includes("session") ||
    /(?:access|refresh)[-_]?token/.test(name)
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}
