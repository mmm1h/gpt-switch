export type ProfileType = "personal" | "workspace" | "normal";
export type PlanType =
  | "free"
  | "plus"
  | "pro"
  | "team"
  | "business"
  | "enterprise"
  | "edu"
  | "unknown";

export type MetadataSource =
  | "session"
  | "bootstrap"
  | "jwt"
  | "wham"
  | "dom"
  | "fallback"
  | "unavailable"
  | (string & {});

export interface AccountMetadata {
  email: string;
  displayName: string;
  planType: PlanType;
  planLabel: string;
  workspaceName: string;
  subscriptionExpiresAt: string;
  metadataDetectedAt: string;
  metadataSource: MetadataSource;
  accountId?: string;
  organizationId?: string;
  userId?: string;
  error?: string;
}

export interface Profile {
  id: string;
  label?: string;
  emailHint?: string;
  email?: string;
  displayName?: string;
  planType?: PlanType;
  planLabel?: string;
  metadataDetectedAt?: string;
  metadataSource?: MetadataSource;
  accountId?: string;
  organizationId?: string;
  userId?: string;
  color: string;
  type: ProfileType;
  workspaceName?: string;
  isPaidAccount?: boolean;
  subscriptionExpiresAt?: string;
  isDefaultPersonal: boolean;
  capturedAt: string;
  lastUsedAt?: string;
  encryptedCookieSnapshotId: string;
  minCookieExpiresAt?: number;
}

export interface EncryptedPayload {
  iv: string;
  data: string;
}

export interface VaultConfig {
  mode: "local";
  keySeed: string;
  salt?: string;
  iterations?: number;
  verifier: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

export interface StoredState {
  version: 1;
  vault: VaultConfig;
  profiles: Profile[];
  encryptedSnapshots: Record<string, EncryptedPayload>;
  rollbackSnapshot?: EncryptedPayload;
  updatedAt: string;
}

export interface SnapshotCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
  session: boolean;
  storeId?: string;
  partitionKey?: chrome.cookies.CookiePartitionKey;
}

export interface CookieSnapshot {
  capturedAt: string;
  minCookieExpiresAt?: number;
  cookies: SnapshotCookie[];
}

export interface PublicState {
  hasVault: boolean;
  unlocked: boolean;
  profiles: Profile[];
  hasRollback: boolean;
  lastError?: string;
}

export type CurrentAccountMatchMethod = "identity" | "cookie" | "none";

export interface CurrentAccountStatus {
  metadata: AccountMetadata;
  savedProfileId?: string;
  matchMethod: CurrentAccountMatchMethod;
  hasCurrentCookies: boolean;
  canSave: boolean;
}

export interface CachedCurrentAccountStatus {
  status: CurrentAccountStatus;
  cachedAt: string;
  tabId?: number;
  url?: string;
}

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "GET_CACHED_CURRENT_ACCOUNT_STATUS" }
  | { type: "PRELOAD_CURRENT_ACCOUNT_STATUS"; url: string }
  | {
      type: "SAVE_CURRENT_PROFILE";
      payload: {
        label?: string;
      };
    }
  | { type: "SWITCH_PROFILE"; profileId: string }
  | { type: "SWITCH_DEFAULT_PERSONAL" }
  | { type: "DELETE_PROFILE"; profileId: string }
  | { type: "ROLLBACK_LAST_SWITCH" }
  | { type: "EXPORT_VAULT" }
  | { type: "IMPORT_VAULT"; payload: unknown }
  | { type: "WORKSPACE_GUARD_DETECTED"; reason: string; url: string };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
