import { describe, expect, it } from "vitest";
import {
  extractOpenAiJwtAccountClaims,
  normalizeSubscriptionExpiry
} from "../src/shared/jwtClaims";

describe("jwt claim helpers", () => {
  it("extracts ChatGPT plan and subscription expiry claims", () => {
    const token = makeJwt({
      email: "pro@example.com",
      "https://api.openai.com/auth": {
        chatgpt_user_id: "user_1",
        chatgpt_plan_type: "pro",
        chatgpt_subscription_active_until: 1_800_000_000,
        account_id: "acct_1",
        organization_id: "org_1"
      }
    });

    expect(extractOpenAiJwtAccountClaims(token)).toMatchObject({
      email: "pro@example.com",
      userId: "user_1",
      planType: "pro",
      planLabel: "PRO",
      subscriptionExpiresAt: "2027-01-15T08:00:00.000Z",
      accountId: "acct_1",
      organizationId: "org_1"
    });
  });

  it("normalizes ISO, unix seconds, unix milliseconds and missing expiry values", () => {
    expect(normalizeSubscriptionExpiry("2027-01-15T08:00:00.000Z")).toBe(
      "2027-01-15T08:00:00.000Z"
    );
    expect(normalizeSubscriptionExpiry(1_800_000_000)).toBe(
      "2027-01-15T08:00:00.000Z"
    );
    expect(normalizeSubscriptionExpiry(1_800_000_000_000)).toBe(
      "2027-01-15T08:00:00.000Z"
    );
    expect(normalizeSubscriptionExpiry("")).toBe("");
  });
});

function makeJwt(payload: unknown): string {
  return [
    encodeBase64Url({ alg: "none", typ: "JWT" }),
    encodeBase64Url(payload),
    "sig"
  ].join(".");
}

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
