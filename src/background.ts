import {
  applyCookieSnapshot,
  captureCurrentCookies,
  deleteManagedCookies
} from "./session/cookieSnapshot";
import { detectCurrentAccountMetadata } from "./session/accountDetector";
import { createCookieSnapshotFingerprint } from "./session/currentAccountStatus";
import { refreshChatGptTabs } from "./session/pageState";
import { runSwitchTransaction } from "./session/switchTransaction";
import { createId } from "./shared/ids";
import {
  createRandomProfileColor,
  findProfileByAccountMetadata,
  isTeamProfile,
  metadataToProfileFields
} from "./shared/profileHelpers";
import type {
  AccountMetadata,
  CookieSnapshot,
  CurrentAccountMatchMethod,
  CurrentAccountStatus,
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
    case "DETECT_CURRENT_ACCOUNT":
      return detectCurrentAccountMetadata();
    case "GET_CURRENT_ACCOUNT_STATUS":
      return getCurrentAccountStatus();
    case "SAVE_CURRENT_PROFILE":
      return saveCurrentProfile(message.payload);
    case "SWITCH_PROFILE":
      return switchProfile(message.profileId);
    case "SWITCH_DEFAULT_PERSONAL":
      return switchDefaultPersonal();
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
  const { state } = await getReadyState();

  return {
    hasVault: true,
    unlocked: true,
    profiles: state.profiles,
    hasRollback: Boolean(state.rollbackSnapshot),
    lastError
  };
}

async function getCurrentAccountStatus(): Promise<CurrentAccountStatus> {
  const { state, key } = await getReadyState();
  const metadata = await detectCurrentAccountMetadata();
  const snapshot = await captureCurrentCookies();
  const match = await findExistingProfile(state, key, metadata, snapshot);
  const hasCurrentCookies = snapshot.cookies.length > 0;

  return {
    metadata,
    savedProfileId: match?.profile.id,
    matchMethod: match?.method ?? "none",
    hasCurrentCookies,
    canSave: hasCurrentCookies && metadata.metadataSource !== "unavailable"
  };
}

async function saveCurrentProfile(payload: { label?: string }): Promise<PublicState> {
  const { state, key } = await getReadyState();
  const label = (payload.label ?? "").trim();
  const metadata = await detectCurrentAccountMetadata();
  const snapshot = await captureCurrentCookies();

  if (snapshot.cookies.length === 0) {
    throw new Error("没有读到 ChatGPT/OpenAI cookie，请先登录后再保存");
  }

  if (metadata.metadataSource === "unavailable") {
    throw new Error("当前账号信息检测失败，请打开 ChatGPT 页面后再保存");
  }

  const profileId = createId("profile");
  const snapshotId = createId("snapshot");
  const encryptedSnapshot = await encryptCookieSnapshot(key, snapshot);
  const profileFields = metadataToProfileFields(metadata);
  const baseProfile: Profile = {
    id: profileId,
    ...profileFields,
    label: label || undefined,
    color: createRandomProfileColor(),
    isDefaultPersonal: false,
    capturedAt: snapshot.capturedAt,
    encryptedCookieSnapshotId: snapshotId
  };
  const existingMatch = await findExistingProfile(state, key, metadata, snapshot);
  const existingIndex = existingMatch
    ? state.profiles.findIndex((profile) => profile.id === existingMatch.profile.id)
    : -1;
  const encryptedSnapshots = {
    ...state.encryptedSnapshots,
    [snapshotId]: encryptedSnapshot
  };
  let profiles: Profile[];

  if (existingIndex >= 0) {
    const existing = state.profiles[existingIndex];

    if (!existing) {
      throw new Error("账号列表状态异常，请重试");
    }

    delete encryptedSnapshots[existing.encryptedCookieSnapshotId];

    const updatedProfile: Profile = {
      ...existing,
      ...profileFields,
      label: label || existing.label,
      color: existing.color || baseProfile.color,
      isDefaultPersonal: existing.isDefaultPersonal,
      capturedAt: snapshot.capturedAt,
      encryptedCookieSnapshotId: snapshotId
    };

    profiles = state.profiles.map((profile, index) =>
      index === existingIndex ? updatedProfile : profile
    );
  } else {
    const hasDefaultPersonal = state.profiles.some(
      (profile) => profile.isDefaultPersonal
    );
    const isDefaultPersonal =
      !hasDefaultPersonal && isLikelyPersonalProfile(baseProfile);

    profiles = [
      ...state.profiles,
      {
        ...baseProfile,
        isDefaultPersonal
      }
    ];
  }

  await setStoredState({
    ...state,
    profiles,
    encryptedSnapshots
  });

  return getPublicState();
}

async function switchProfile(profileId: string): Promise<PublicState> {
  const { state, key } = await getReadyState();
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
    },
    validateTarget: async () => {
      try {
        const response = await fetch("https://chatgpt.com/api/auth/session");
        if (!response.ok) return false;
        const text = await response.text();
        if (!text) return false;
        try {
          const json = JSON.parse(text);
          return Boolean(json && json.user);
        } catch {
          return false;
        }
      } catch {
        return false;
      }
    },
    applyRollback: async (rollbackSnapshot) => {
      await applyCookieSnapshot(rollbackSnapshot);
    }
  });

  const { state: latest } = await getReadyState();
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
  const { state } = await getReadyState();
  const profile =
    state.profiles.find((item) => item.isDefaultPersonal) ??
    state.profiles.find(isLikelyPersonalProfile);

  if (!profile) {
    throw new Error("没有可回退的个人账号，请先登录个人账号并保存快照");
  }

  return switchProfile(profile.id);
}

async function deleteProfile(profileId: string): Promise<PublicState> {
  const { state } = await getReadyState();
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
  const { state, key } = await getReadyState();

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
  const { state } = await getReadyState();
  return state;
}

async function importVault(payload: unknown): Promise<PublicState> {
  const state = await replaceStoredState(payload);
  activeKey = await unlockState(state);
  lastError = undefined;
  return {
    hasVault: true,
    unlocked: true,
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

async function getReadyState(): Promise<{ state: StoredState; key: CryptoKey }> {
  const existing = await getStoredState();

  if (!existing) {
    const created = await createInitialState();
    activeKey = created.key;
    await setStoredState(created.state);
    lastError = undefined;
    return created;
  }

  if (activeKey) {
    return { state: existing, key: activeKey };
  }

  activeKey = await unlockState(existing);
  lastError = undefined;
  return { state: existing, key: activeKey };
}

function findProfile(state: StoredState, profileId: string): Profile {
  const profile = state.profiles.find((item) => item.id === profileId);

  if (!profile) {
    throw new Error("找不到这个账号");
  }

  return profile;
}

async function findExistingProfile(
  state: StoredState,
  key: CryptoKey,
  metadata: AccountMetadata,
  snapshot: CookieSnapshot
): Promise<{ profile: Profile; method: CurrentAccountMatchMethod } | undefined> {
  const identityProfile = findProfileByAccountMetadata(state.profiles, metadata);

  if (identityProfile) {
    return { profile: identityProfile, method: "identity" };
  }

  const currentFingerprint = await createCookieSnapshotFingerprint(snapshot);

  if (!currentFingerprint) {
    return undefined;
  }

  for (const profile of state.profiles) {
    const payload = state.encryptedSnapshots[profile.encryptedCookieSnapshotId];

    if (!payload) {
      continue;
    }

    try {
      const savedSnapshot = await decryptCookieSnapshot(key, payload);
      const savedFingerprint = await createCookieSnapshotFingerprint(savedSnapshot);

      if (savedFingerprint === currentFingerprint) {
        return { profile, method: "cookie" };
      }
    } catch {
      // Corrupt snapshots should not block status checks for other profiles.
    }
  }

  return undefined;
}

function isLikelyPersonalProfile(profile: Profile): boolean {
  if (isTeamProfile(profile) || profile.workspaceName) {
    return false;
  }

  if (profile.planType) {
    return ["free", "plus", "pro", "unknown"].includes(profile.planType);
  }

  return profile.type !== "workspace";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
