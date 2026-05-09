import { normalizePlanType, planLabelFor } from "./profileHelpers";
import type { AccountMetadata } from "./types";

type JwtPayload = Record<string, unknown>;

const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM = "https://api.openai.com/profile";

export function extractOpenAiJwtAccountClaims(
  token: unknown
): Partial<AccountMetadata> {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return {};
  }

  const auth = getRecord(payload[OPENAI_AUTH_CLAIM]);
  const profile = getRecord(payload[OPENAI_PROFILE_CLAIM]);
  const planType = normalizePlanType(auth?.chatgpt_plan_type);
  const email =
    normalizeText(payload.email) ||
    normalizeText(profile?.email) ||
    normalizeText(payload.loginEmail);

  return {
    email,
    userId: normalizeText(auth?.chatgpt_user_id),
    planType,
    planLabel: planLabelFor(planType),
    subscriptionExpiresAt: normalizeSubscriptionExpiry(
      auth?.chatgpt_subscription_active_until
    ),
    accountId: normalizeText(auth?.account_id),
    organizationId: normalizeText(auth?.organization_id)
  };
}

export function normalizeSubscriptionExpiry(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const timestamp = normalizeTimestamp(value);
  const date = timestamp === null ? new Date(String(value).trim()) : new Date(timestamp);

  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 2020) {
    return "";
  }

  return date.toISOString();
}

function decodeJwtPayload(token: unknown): JwtPayload | null {
  const parts = String(token ?? "").split(".");

  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const json = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(json) as unknown;
    return getRecord(parsed);
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeTimestamp(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
