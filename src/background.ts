import {
  applyCookieSnapshot,
  captureCurrentCookies,
  deleteManagedCookies
} from "./session/cookieSnapshot";
import { refreshChatGptTabs } from "./session/pageState";
import { runSwitchTransaction } from "./session/switchTransaction";
import { createId } from "./shared/ids";
import type {
  CookieSnapshot,
  Profile,
  PublicState,
  RuntimeMessage,
  RuntimeResponse,
  StoredState
} from "./shared/types";
import {
  getStoredState,
  replaceStoredState,
  setStoredState
} from "./storage/extensionStorage";
import {
  createInitialState,
  decryptCookieSnapshot,
  encryptCookieSnapshot,
  unlockState
} from "./security/vault";

let activeKey: CryptoKey | null = null;
let lastError: string | undefined;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((data) => {
      sendResponse({ ok: true, data } satisfies RuntimeResponse);
    })
    .catch((error: unknown) => {
      lastError = formatError(error);
      sendResponse({ ok: false, error: lastError } satisfies RuntimeResponse);
    });

  return true;
});

async function handleMessage(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
      return getPublicState();
    case "SETUP_VAULT":
      return setupVault(message.password);
    case "UNLOCK_VAULT":
      return unlockVault(message.password);
    case "LOCK_VAULT":
      activeKey = null;
      return getPublicState();
    case "SAVE_CURRENT_PROFILE":
      return saveCurrentProfile(message.payload);
    case "SWITCH_PROFILE":
      return switchProfile(message.profileId);
    case "SWITCH_DEFAULT_PERSONAL":
      return switchDefaultPersonal();
    case "SET_DEFAULT_PERSONAL":
      return setDefaultPersonal(message.profileId);
    case "DELETE_PROFILE":
      return deleteProfile(message.profileId);
    case "ROLLBACK_LAST_SWITCH":
      return rollbackLastSwitch();
    case "EXPORT_VAULT":
      return exportVault();
    case "IMPORT_VAULT":
      return importVault(message.payload);
    case "WORKSPACE_GUARD_DETECTED":
      return handleWorkspaceGuard(message.reason, message.url, sender);
  }
}

async function getPublicState(): Promise<PublicState> {
  const state = await getStoredState();

  return {
    hasVault: Boolean(state),
    unlocked: Boolean(activeKey),
    profiles: state?.profiles ?? [],
    hasRollback: Boolean(state?.rollbackSnapshot),
    lastError
  };
}

async function setupVault(password: string): Promise<PublicState> {
  const existing = await getStoredState();

  if (existing) {
    throw new Error("保险箱已经存在，请先导出备份后再重置");
  }

  const { state, key } = await createInitialState(password);
  activeKey = key;
  await setStoredState(state);
  lastError = undefined;
  return getPublicState();
}

async function unlockVault(password: string): Promise<PublicState> {
  const state = await requireState();
  activeKey = await unlockState(state, password);
  lastError = undefined;
  return getPublicState();
}

async function saveCurrentProfile(payload: {
  label: string;
  emailHint: string;
  color: string;
  profileType: Profile["type"];
  isDefaultPersonal: boolean;
}): Promise<PublicState> {
  const state = await requireState();
  const key = requireKey();
  const label = payload.label.trim();

  if (!label) {
    throw new Error("账号标签不能为空");
  }

  const snapshot = await captureCurrentCookies();

  if (snapshot.cookies.length === 0) {
    throw new Error("没有读到 ChatGPT/OpenAI cookie，请先登录后再保存");
  }

  const profileId = createId("profile");
  const snapshotId = createId("snapshot");
  const encryptedSnapshot = await encryptCookieSnapshot(key, snapshot);
  const isDefaultPersonal = payload.isDefaultPersonal;
  const profile: Profile = {
    id: profileId,
    label,
    emailHint: payload.emailHint.trim(),
    color: normalizeColor(payload.color),
    type: isDefaultPersonal ? "personal" : payload.profileType,
    isDefaultPersonal,
    capturedAt: snapshot.capturedAt,
    encryptedCookieSnapshotId: snapshotId
  };

  const profiles = state.profiles.map((item) =>
    isDefaultPersonal ? { ...item, isDefaultPersonal: false } : item
  );

  await setStoredState({
    ...state,
    profiles: [...profiles, profile],
    encryptedSnapshots: {
      ...state.encryptedSnapshots,
      [snapshotId]: encryptedSnapshot
    }
  });

  return getPublicState();
}

async function switchProfile(profileId: string): Promise<PublicState> {
  const state = await requireState();
  const key = requireKey();
  const profile = findProfile(state, profileId);
  const payload = state.encryptedSnapshots[profile.encryptedCookieSnapshotId];

  if (!payload) {
    throw new Error("这个账号的会话快照丢失了");
  }

  const targetSnapshot = await decryptCookieSnapshot(key, payload);

  await runSwitchTransaction({
    captureCurrent: captureCurrentCookies,
    persistRollback: async (snapshot) => {
      await persistRollbackSnapshot(state, key, snapshot);
    },
    deleteManaged: deleteManagedCookies,
    applyTarget: async () => {
      await applyCookieSnapshot(targetSnapshot);
    },
    refreshTabs: async () => {
      await refreshChatGptTabs(true);
    }
  });

  const latest = await requireState();
  await setStoredState({
    ...latest,
    profiles: latest.profiles.map((item) =>
      item.id === profileId
        ? { ...item, lastUsedAt: new Date().toISOString() }
        : item
    )
  });

  return getPublicState();
}

async function switchDefaultPersonal(): Promise<PublicState> {
  const state = await requireState();
  const profile = state.profiles.find((item) => item.isDefaultPersonal);

  if (!profile) {
    throw new Error("还没有设置个人默认账号，请先在弹窗里标记一个");
  }

  return switchProfile(profile.id);
}

async function setDefaultPersonal(profileId: string): Promise<PublicState> {
  const state = await requireState();
  findProfile(state, profileId);

  await setStoredState({
    ...state,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      isDefaultPersonal: profile.id === profileId,
      type: profile.id === profileId ? "personal" : profile.type
    }))
  });

  return getPublicState();
}

async function deleteProfile(profileId: string): Promise<PublicState> {
  const state = await requireState();
  const profile = findProfile(state, profileId);
  const encryptedSnapshots = { ...state.encryptedSnapshots };
  delete encryptedSnapshots[profile.encryptedCookieSnapshotId];

  await setStoredState({
    ...state,
    profiles: state.profiles.filter((item) => item.id !== profileId),
    encryptedSnapshots
  });

  return getPublicState();
}

async function rollbackLastSwitch(): Promise<PublicState> {
  const state = await requireState();
  const key = requireKey();

  if (!state.rollbackSnapshot) {
    throw new Error("没有可回滚的切换快照");
  }

  const snapshot = await decryptCookieSnapshot(key, state.rollbackSnapshot);
  await deleteManagedCookies();
  await applyCookieSnapshot(snapshot);
  await refreshChatGptTabs(true);

  await setStoredState({
    ...state,
    rollbackSnapshot: undefined
  });

  return getPublicState();
}

async function exportVault(): Promise<StoredState> {
  return requireState();
}

async function importVault(payload: unknown): Promise<PublicState> {
  const state = await replaceStoredState(payload);
  activeKey = null;
  lastError = undefined;
  return {
    hasVault: true,
    unlocked: false,
    profiles: state.profiles,
    hasRollback: Boolean(state.rollbackSnapshot)
  };
}

async function handleWorkspaceGuard(
  reason: string,
  url: string,
  sender: chrome.runtime.MessageSender
): Promise<{ acknowledged: true }> {
  console.info("[GPT Switch] workspace guard detected", {
    reason,
    url,
    tabId: sender.tab?.id
  });

  return { acknowledged: true };
}

async function persistRollbackSnapshot(
  baseState: StoredState,
  key: CryptoKey,
  snapshot: CookieSnapshot
): Promise<void> {
  const rollbackSnapshot = await encryptCookieSnapshot(key, snapshot);
  const latest = (await getStoredState()) ?? baseState;
  await setStoredState({
    ...latest,
    rollbackSnapshot
  });
}

async function requireState(): Promise<StoredState> {
  const state = await getStoredState();

  if (!state) {
    throw new Error("还没有创建保险箱");
  }

  return state;
}

function requireKey(): CryptoKey {
  if (!activeKey) {
    throw new Error("保险箱未解锁，请先输入口令");
  }

  return activeKey;
}

function findProfile(state: StoredState, profileId: string): Profile {
  const profile = state.profiles.find((item) => item.id === profileId);

  if (!profile) {
    throw new Error("找不到这个账号");
  }

  return profile;
}

function normalizeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#176b5b";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
