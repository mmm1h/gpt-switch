import { STORAGE_KEY } from "../shared/constants";
import type { StoredState } from "../shared/types";

export async function getStoredState(): Promise<StoredState | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredState | undefined) ?? null;
}

export async function setStoredState(state: StoredState): Promise<void> {
  const now = new Date().toISOString();
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...state,
      vault: {
        ...state.vault,
        updatedAt: now
      },
      updatedAt: now
    } satisfies StoredState
  });
}

export async function replaceStoredState(payload: unknown): Promise<StoredState> {
  assertStoredState(payload);
  await chrome.storage.local.set({ [STORAGE_KEY]: payload });
  return payload;
}

function assertStoredState(payload: unknown): asserts payload is StoredState {
  if (!payload || typeof payload !== "object") {
    throw new Error("导入文件不是有效的 vault");
  }

  const state = payload as Partial<StoredState>;

  if (
    state.version !== 1 ||
    !state.vault ||
    !Array.isArray(state.profiles) ||
    !state.encryptedSnapshots ||
    typeof state.encryptedSnapshots !== "object"
  ) {
    throw new Error("导入文件结构不正确");
  }
}
