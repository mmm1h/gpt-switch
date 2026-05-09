import { describe, expect, it } from "vitest";
import {
  buildCookieUrl,
  cookieKey,
  isManagedCookie,
  normalizeCookie
} from "../src/session/cookieSnapshot";

describe("cookie snapshot helpers", () => {
  it("preserves httpOnly, sameSite, expirationDate and partitionKey", () => {
    const cookie = normalizeCookie({
      name: "session",
      value: "secret",
      domain: ".chatgpt.com",
      hostOnly: false,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "no_restriction",
      expirationDate: 1_800_000_000,
      session: false,
      storeId: "0",
      partitionKey: { topLevelSite: "https://chatgpt.com" }
    } as chrome.cookies.Cookie);

    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("no_restriction");
    expect(cookie.expirationDate).toBe(1_800_000_000);
    expect(cookie.partitionKey).toEqual({ topLevelSite: "https://chatgpt.com" });
  });

  it("builds stable cookie URLs and keys", () => {
    const cookie = normalizeCookie({
      name: "session",
      value: "secret",
      domain: ".openai.com",
      hostOnly: false,
      path: "/auth",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      session: true,
      storeId: "0"
    } as chrome.cookies.Cookie);

    expect(buildCookieUrl(cookie)).toBe("https://openai.com/auth");
    expect(cookieKey(cookie)).toContain(".openai.com|/auth|session");
  });

  it("keeps only ChatGPT and OpenAI managed cookies", () => {
    expect(isManagedCookie({ domain: ".chatgpt.com" })).toBe(true);
    expect(isManagedCookie({ domain: "auth.openai.com" })).toBe(true);
    expect(isManagedCookie({ domain: ".example.com" })).toBe(false);
  });
});
