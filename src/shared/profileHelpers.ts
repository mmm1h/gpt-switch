import type { AccountMetadata, PlanType, Profile } from "./types";

export const PROFILE_COLORS = [
  "#176b5b",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#0f766e",
  "#4f46e5",
  "#a16207"
] as const;

const PLAN_LABELS: Record<PlanType, string> = {
  free: "FREE",
  plus: "PLUS",
  pro: "PRO",
  team: "TEAM",
  business: "BUSINESS",
  enterprise: "ENTERPRISE",
  edu: "EDU",
  unknown: "UNKNOWN"
};

export function normalizePlanType(value: unknown): PlanType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (/\b(enterprise)\b/.test(normalized)) {
    return "enterprise";
  }

  if (/\b(edu|education)\b/.test(normalized)) {
    return "edu";
  }

  if (/\b(business)\b/.test(normalized)) {
    return "business";
  }

  if (/\b(team|teams|workspace)\b/.test(normalized)) {
    return "team";
  }

  if (/\b(pro)\b/.test(normalized)) {
    return "pro";
  }

  if (/\b(plus)\b/.test(normalized)) {
    return "plus";
  }

  if (/\b(free)\b/.test(normalized)) {
    return "free";
  }

  return "unknown";
}

export function planLabelFor(planType: PlanType, fallback = ""): string {
  if (planType !== "unknown") {
    return PLAN_LABELS[planType];
  }

  return fallback.trim().toUpperCase() || PLAN_LABELS.unknown;
}

export function createRandomProfileColor(): string {
  const values = new Uint32Array(1);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    values[0] = Math.floor(Math.random() * 0xffffffff);
  }

  const index = (values[0] ?? 0) % PROFILE_COLORS.length;
  return PROFILE_COLORS[index] ?? PROFILE_COLORS[0];
}

export function getProfileTitle(profile: Profile): string {
  return (
    profile.email ||
    profile.displayName ||
    profile.label ||
    profile.emailHint ||
    "未知账号"
  );
}

export function getProfileLabel(profile: Profile): string {
  return (profile.label ?? "").trim();
}

export function getPlanLabel(profile: Profile): string {
  return profile.planLabel || planLabelFor(profile.planType ?? "unknown");
}

export function isTeamProfile(profile: Profile): boolean {
  return (
    profile.planType === "team" ||
    profile.planType === "business" ||
    profile.planType === "enterprise" ||
    profile.planType === "edu" ||
    profile.type === "workspace"
  );
}

export function getAccountMetadataIdentityKey(metadata: AccountMetadata): string {
  return buildStrongIdentityKey({
    email: metadata.email,
    accountId: metadata.accountId,
    organizationId: metadata.organizationId,
    workspaceName: metadata.workspaceName,
    userId: metadata.userId
  });
}

export function findProfileByAccountMetadata(
  profiles: Profile[],
  metadata: AccountMetadata
): Profile | undefined {
  const identityKey = getAccountMetadataIdentityKey(metadata);

  if (identityKey) {
    const match = profiles.find(
      (profile) => getProfileIdentityKey(profile) === identityKey
    );

    if (match) {
      return match;
    }
  }

  const email = normalizeIdentityPart(metadata.email);

  if (!email) {
    return undefined;
  }

  const emailMatches = profiles.filter(
    (profile) => normalizeIdentityPart(profile.email || profile.emailHint) === email
  );

  return emailMatches.length === 1 ? emailMatches[0] : undefined;
}

export function metadataToProfileFields(metadata: AccountMetadata): Pick<
  Profile,
  | "email"
  | "displayName"
  | "planType"
  | "planLabel"
  | "workspaceName"
  | "subscriptionExpiresAt"
  | "metadataDetectedAt"
  | "metadataSource"
  | "accountId"
  | "organizationId"
  | "userId"
  | "type"
  | "isPaidAccount"
> {
  const planType = metadata.planType;
  const isTeam =
    planType === "team" ||
    planType === "business" ||
    planType === "enterprise" ||
    planType === "edu" ||
    Boolean(metadata.workspaceName);

  return {
    email: metadata.email,
    displayName: metadata.displayName,
    planType,
    planLabel: planLabelFor(planType, metadata.planLabel),
    workspaceName: metadata.workspaceName,
    subscriptionExpiresAt: metadata.subscriptionExpiresAt,
    metadataDetectedAt: metadata.metadataDetectedAt,
    metadataSource: metadata.metadataSource,
    accountId: metadata.accountId,
    organizationId: metadata.organizationId,
    userId: metadata.userId,
    type: isTeam ? "workspace" : "personal",
    isPaidAccount: planType !== "free" && planType !== "unknown"
  };
}

export function getProfileIdentityKey(profile: Profile): string {
  return buildStrongIdentityKey({
    email: profile.email || profile.emailHint,
    accountId: profile.accountId,
    organizationId: profile.organizationId,
    workspaceName: profile.workspaceName,
    userId: profile.userId
  });
}

function buildStrongIdentityKey(input: {
  email?: string;
  accountId?: string;
  organizationId?: string;
  workspaceName?: string;
  userId?: string;
}): string {
  const email = normalizeIdentityPart(input.email);
  const accountId = normalizeIdentityPart(input.accountId);
  const organizationId = normalizeIdentityPart(input.organizationId);
  const workspaceName = normalizeIdentityPart(input.workspaceName);
  const userId = normalizeIdentityPart(input.userId);
  const secondaryParts = [accountId, organizationId, workspaceName, userId];

  if (email && secondaryParts.some(Boolean)) {
    return ["email", email, ...secondaryParts].join("|");
  }

  if (!email && secondaryParts.some(Boolean)) {
    return ["account", ...secondaryParts].join("|");
  }

  return "";
}

function normalizeIdentityPart(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
