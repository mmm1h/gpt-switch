export type ProfileType = "personal" | "workspace" | "normal";

export interface Profile {
  id: string;
  label: string;
  emailHint: string;
  color: string;
  type: ProfileType;
  workspaceName?: string;
  isPaidAccount?: boolean;
  subscriptionExpiresAt?: string;
  isDefaultPersonal: boolean;
  capturedAt: string;
  lastUsedAt?: string;
  encryptedCookieSnapshotId: string;
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
  cookies: SnapshotCookie[];
}

export interface PublicState {
  hasVault: boolean;
  unlocked: boolean;
  profiles: Profile[];
  hasRollback: boolean;
  lastError?: string;
}

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | {
      type: "SAVE_CURRENT_PROFILE";
      payload: {
        label: string;
        emailHint: string;
        color: string;
        profileType: ProfileType;
        workspaceName: string;
        isPaidAccount: boolean;
        subscriptionExpiresAt: string;
        isDefaultPersonal: boolean;
      };
    }
  | { type: "SWITCH_PROFILE"; profileId: string }
  | { type: "SWITCH_DEFAULT_PERSONAL" }
  | { type: "SET_DEFAULT_PERSONAL"; profileId: string }
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
