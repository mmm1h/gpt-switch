import { KDF_ITERATIONS, VAULT_MAGIC } from "../shared/constants";
import type {
  CookieSnapshot,
  EncryptedPayload,
  StoredState
} from "../shared/types";
import { decryptJson, deriveAesKey, encryptJson, randomBase64 } from "./crypto";

interface VaultVerifier {
  magic: string;
  createdAt: string;
}

export async function createInitialState(
  password: string
): Promise<{ state: StoredState; key: CryptoKey }> {
  assertPassword(password);

  const now = new Date().toISOString();
  const salt = randomBase64(16);
  const key = await deriveAesKey(password, salt, KDF_ITERATIONS);
  const verifier = await encryptJson(key, {
    magic: VAULT_MAGIC,
    createdAt: now
  } satisfies VaultVerifier);

  return {
    key,
    state: {
      version: 1,
      vault: {
        salt,
        iterations: KDF_ITERATIONS,
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

export async function unlockState(
  state: StoredState,
  password: string
): Promise<CryptoKey> {
  assertPassword(password);

  const key = await deriveAesKey(
    password,
    state.vault.salt,
    state.vault.iterations
  );
  const verifier = await decryptJson<VaultVerifier>(key, state.vault.verifier);

  if (verifier.magic !== VAULT_MAGIC) {
    throw new Error("保险箱口令不正确");
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

function assertPassword(password: string): void {
  if (password.trim().length < 8) {
    throw new Error("口令至少需要 8 个字符");
  }
}
