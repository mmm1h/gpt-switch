import { VAULT_MAGIC } from "../shared/constants";
import type {
  CookieSnapshot,
  EncryptedPayload,
  StoredState
} from "../shared/types";
import {
  decryptJson,
  encryptJson,
  importAesKeyFromBase64,
  randomBase64
} from "./crypto";

interface VaultVerifier {
  magic: string;
  createdAt: string;
}

export async function createInitialState(): Promise<{ state: StoredState; key: CryptoKey }> {
  const now = new Date().toISOString();
  const keySeed = randomBase64(32);
  const key = await importAesKeyFromBase64(keySeed);
  const verifier = await encryptJson(key, {
    magic: VAULT_MAGIC,
    createdAt: now
  } satisfies VaultVerifier);

  return {
    key,
    state: {
      version: 1,
      vault: {
        mode: "local",
        keySeed,
        verifier,
        createdAt: now,
        updatedAt: now
      },
      profiles: [],
      encryptedSnapshots: {},
      updatedAt: now
    }
  };
}

export async function unlockState(state: StoredState): Promise<CryptoKey> {
  if (state.vault.mode !== "local" || !state.vault.keySeed) {
    throw new Error("这是旧版口令保险箱，请重新保存账号快照");
  }

  const key = await importAesKeyFromBase64(state.vault.keySeed);
  const verifier = await decryptJson<VaultVerifier>(key, state.vault.verifier);

  if (verifier.magic !== VAULT_MAGIC) {
    throw new Error("本地保险箱校验失败");
  }

  return key;
}

export async function encryptCookieSnapshot(
  key: CryptoKey,
  snapshot: CookieSnapshot
): Promise<EncryptedPayload> {
  return encryptJson(key, snapshot);
}

export async function decryptCookieSnapshot(
  key: CryptoKey,
  payload: EncryptedPayload
): Promise<CookieSnapshot> {
  return decryptJson<CookieSnapshot>(key, payload);
}
