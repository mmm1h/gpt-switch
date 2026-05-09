import { COOKIE_DOMAIN_SUFFIXES } from "../shared/constants";
import type { CookieSnapshot, SnapshotCookie } from "../shared/types";

type ChromeCookieWithPartition = chrome.cookies.Cookie;
type ChromeSetDetailsWithPartition = chrome.cookies.SetDetails;
type ChromeRemoveDetailsWithPartition = chrome.cookies.CookieDetails;

export async function captureCurrentCookies(): Promise<CookieSnapshot> {
  const cookies = new Map<string, SnapshotCookie>();

  for (const domain of COOKIE_DOMAIN_SUFFIXES) {
    const domainCookies = await getAllCookies({ domain });

    for (const cookie of domainCookies) {
      const normalized = normalizeCookie(cookie);

      if (isManagedCookie(normalized)) {
        cookies.set(cookieKey(normalized), normalized);
      }
    }
  }

  const snapshotCookies = Array.from(cookies.values()).sort(compareCookie);

  return {
    capturedAt: new Date().toISOString(),
    minCookieExpiresAt: getMinCookieExpiresAt(snapshotCookies),
    cookies: snapshotCookies
  };
}

export async function deleteManagedCookies(): Promise<void> {
  const snapshot = await captureCurrentCookies();

  for (const cookie of snapshot.cookies) {
    await removeCookie(cookie);
  }
}

export async function applyCookieSnapshot(snapshot: CookieSnapshot): Promise<void> {
  for (const cookie of snapshot.cookies) {
    await setCookie(cookie);
  }
}

export function normalizeCookie(cookie: ChromeCookieWithPartition): SnapshotCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate,
    session: cookie.session,
    storeId: cookie.storeId,
    partitionKey: cookie.partitionKey
  };
}

export function buildCookieUrl(cookie: Pick<SnapshotCookie, "domain" | "path">): string {
  const host = cookie.domain.replace(/^\./, "");
  const safePath = cookie.path.startsWith("/") ? cookie.path : `/${cookie.path}`;
  return `https://${host}${safePath}`;
}

export function isManagedCookie(cookie: Pick<SnapshotCookie, "domain">): boolean {
  const normalizedDomain = cookie.domain.replace(/^\./, "").toLowerCase();
  return COOKIE_DOMAIN_SUFFIXES.some(
    (suffix) =>
      normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)
  );
}

export function getMinCookieExpiresAt(cookies: SnapshotCookie[]): number | undefined {
  const coreAuthExpiries = cookies
    .filter(isCoreAuthCookie)
    .map((cookie) => cookie.expirationDate)
    .filter((value): value is number => typeof value === "number" && value > 0);

  if (coreAuthExpiries.length === 0) {
    return undefined;
  }

  return Math.min(...coreAuthExpiries);
}

function isCoreAuthCookie(cookie: SnapshotCookie): boolean {
  const name = cookie.name.toLowerCase();

  return (
    name.includes("session") ||
    /(?:access|refresh)[-_]?token/.test(name)
  );
}

export function cookieKey(cookie: SnapshotCookie): string {
  return [
    cookie.storeId ?? "",
    cookie.domain,
    cookie.path,
    cookie.name,
    JSON.stringify(cookie.partitionKey ?? null)
  ].join("|");
}

function compareCookie(left: SnapshotCookie, right: SnapshotCookie): number {
  return cookieKey(left).localeCompare(cookieKey(right));
}

function getAllCookies(
  details: chrome.cookies.GetAllDetails
): Promise<ChromeCookieWithPartition[]> {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(details, (cookies) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(cookies as ChromeCookieWithPartition[]);
    });
  });
}

function setCookie(cookie: SnapshotCookie): Promise<void> {
  return new Promise((resolve, reject) => {
    const details: ChromeSetDetailsWithPartition = {
      url: buildCookieUrl(cookie),
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite as chrome.cookies.SameSiteStatus | undefined,
      storeId: cookie.storeId,
      partitionKey: cookie.partitionKey
    };

    if (!cookie.hostOnly) {
      details.domain = cookie.domain.replace(/^\./, "");
    }

    if (!cookie.session && cookie.expirationDate) {
      details.expirationDate = cookie.expirationDate;
    }

    chrome.cookies.set(details, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function removeCookie(cookie: SnapshotCookie): Promise<void> {
  return new Promise((resolve, reject) => {
    const details: ChromeRemoveDetailsWithPartition = {
      url: buildCookieUrl(cookie),
      name: cookie.name,
      storeId: cookie.storeId,
      partitionKey: cookie.partitionKey
    };

    chrome.cookies.remove(details, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}
