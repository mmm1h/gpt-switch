import {
  applyCookieSnapshot,
  captureCurrentCookies,
  deleteManagedCookies
} from "./session/cookieSnapshot";
import { detectCurrentAccountMetadata } from "./session/accountDetector";
import {
  createCookieSnapshotFingerprint,
  createCookieSnapshotIdentityFingerprint
} from "./session/currentAccountStatus";
import { refreshChatGptTabs } from "./session/pageState";
import { runSwitchTransaction } from "./session/switchTransaction";
import { createId } from "./shared/ids";
import {
  createRandomProfileColor,
  findProfileByAccountMetadata,
  isTeamProfile,
  metadataToProfileFields,
  profileToMetadata
} from "./shared/profileHelpers";
import type {
  AccountMetadata,
  CachedCurrentAccountStatus,
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
  CHATGPT_TAB_PATTERNS,
  CURRENT_ACCOUNT_STATUS_CACHE_KEY
} from "./shared/constants";
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

interface InternalCurrentAccountStatusCache extends CachedCurrentAccountStatus {
  cookieFingerprint: string;
}

let activeKey: CryptoKey | null = null;
let lastError: string | undefined;
let currentAccountStatusCache: InternalCurrentAccountStatusCache | null = null;
let currentAccountStatusRefreshPromise: Promise<InternalCurrentAccountStatusCache> | null = null;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isChatGptUrl(tab.url)) {
    return;
  }

  globalThis.setTimeout(() => {
    void preloadCurrentAccountStatusForTab(tabId, tab.url);
  }, 1200);
});

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
    case "GET_CACHED_CURRENT_ACCOUNT_STATUS":
      return getCachedCurrentAccountStatus();
    case "PRELOAD_CURRENT_ACCOUNT_STATUS":
      return preloadCurrentAccountStatus(message.url, sender);
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

async function preloadCurrentAccountStatus(
  url: string,
  sender: chrome.runtime.MessageSender
): Promise<CachedCurrentAccountStatus> {
  if (currentAccountStatusRefreshPromise) {
    return toPublicStatusCache(await currentAccountStatusRefreshPromise);
  }

  return toPublicStatusCache(await refreshCurrentAccountStatusCache(sender, url));
}

async function preloadCurrentAccountStatusForTab(
  tabId: number,
  url?: string
): Promise<void> {
  try {
    await refreshCurrentAccountStatusCache(
      { tab: { id: tabId, url } as chrome.tabs.Tab },
      url
    );
  } catch (error) {
    lastError = formatError(error);
  }
}

function isChatGptUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}

async function findOpenChatGptTab(): Promise<chrome.tabs.Tab | undefined> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: CHATGPT_TAB_PATTERNS
  });

  if (activeTab?.id) {
    return activeTab;
  }

  const [anyTab] = await chrome.tabs.query({
    url: CHATGPT_TAB_PATTERNS
  });

  return anyTab;
}

async function refreshCurrentAccountStatusCache(
  sender?: chrome.runtime.MessageSender,
  url?: string
): Promise<InternalCurrentAccountStatusCache> {
  if (currentAccountStatusRefreshPromise) {
    return currentAccountStatusRefreshPromise;
  }

  currentAccountStatusRefreshPromise = createCurrentAccountStatusCache(sender, url)
    .then((cache) => {
      currentAccountStatusCache = cache;
      void persistCurrentAccountStatusCache(cache);
      return cache;
    })
    .finally(() => {
      currentAccountStatusRefreshPromise = null;
    });

  return currentAccountStatusRefreshPromise;
}

async function getCachedCurrentAccountStatus(): Promise<CachedCurrentAccountStatus | null> {
  currentAccountStatusCache ??= await loadCurrentAccountStatusCache();

  if (!currentAccountStatusCache) {
    return refreshCurrentAccountStatusCacheFromOpenTab();
  }

  const snapshot = await captureCurrentCookies();
  const fingerprint = await getCacheCookieFingerprint(snapshot);

  if (fingerprint !== currentAccountStatusCache.cookieFingerprint) {
    await clearCurrentAccountStatusCache();
    return refreshCurrentAccountStatusCacheFromOpenTab();
  }

  return toPublicStatusCache(currentAccountStatusCache);
}

async function refreshCurrentAccountStatusCacheFromOpenTab(): Promise<CachedCurrentAccountStatus | null> {
  const tab = await findOpenChatGptTab();

  if (!tab?.id) {
    return null;
  }

  try {
    return toPublicStatusCache(
      await refreshCurrentAccountStatusCache({ tab }, tab.url)
    );
  } catch (error) {
    lastError = formatError(error);
    return null;
  }
}

async function getVerifiedCurrentAccountStatusCache(
  snapshot: CookieSnapshot
): Promise<InternalCurrentAccountStatusCache | null> {
  currentAccountStatusCache ??= await loadCurrentAccountStatusCache();

  if (!currentAccountStatusCache) {
    return null;
  }

  const fingerprint = await getCacheCookieFingerprint(snapshot);

  if (fingerprint !== currentAccountStatusCache.cookieFingerprint) {
    await clearCurrentAccountStatusCache();
    return null;
  }

  return currentAccountStatusCache;
}

async function createCurrentAccountStatusCache(
  sender?: chrome.runtime.MessageSender,
  url?: string
): Promise<InternalCurrentAccountStatusCache> {
  const result = await getCurrentAccountStatus(sender?.tab?.id);
  const postDetectionSnapshot = await captureCurrentCookies();
  const postDetectionFingerprint = await getCacheCookieFingerprint(postDetectionSnapshot);

  return {
    status: result.status,
    cachedAt: new Date().toISOString(),
    tabId: sender?.tab?.id,
    url: url || sender?.tab?.url,
    cookieFingerprint: postDetectionFingerprint || result.cookieFingerprint
  };
}

async function getCacheCookieFingerprint(snapshot: CookieSnapshot): Promise<string> {
  return (
    (await createCookieSnapshotIdentityFingerprint(snapshot)) ||
    (await createCookieSnapshotFingerprint(snapshot))
  );
}

function toPublicStatusCache(
  cache: InternalCurrentAccountStatusCache
): CachedCurrentAccountStatus {
  return {
    status: cache.status,
    cachedAt: cache.cachedAt,
    tabId: cache.tabId,
    url: cache.url
  };
}

async function loadCurrentAccountStatusCache(): Promise<InternalCurrentAccountStatusCache | null> {
  const result = await chrome.storage.session.get(CURRENT_ACCOUNT_STATUS_CACHE_KEY);
  const value = result[CURRENT_ACCOUNT_STATUS_CACHE_KEY] as
    | InternalCurrentAccountStatusCache
    | undefined;

  if (!value?.status || typeof value.cookieFingerprint !== "string") {
    return null;
  }

  return value;
}

async function persistCurrentAccountStatusCache(
  cache: InternalCurrentAccountStatusCache
): Promise<void> {
  await chrome.storage.session.set({
    [CURRENT_ACCOUNT_STATUS_CACHE_KEY]: cache
  });
}

async function clearCurrentAccountStatusCache(): Promise<void> {
  currentAccountStatusCache = null;
  await chrome.storage.session.remove(CURRENT_ACCOUNT_STATUS_CACHE_KEY);
}

async function getCurrentAccountStatus(
  tabId?: number
): Promise<{ status: CurrentAccountStatus; cookieFingerprint: string }> {
  const { state, key } = await getReadyState();
  const snapshot = await captureCurrentCookies();
  const hasCurrentCookies = snapshot.cookies.length > 0;
  const currentFingerprint = hasCurrentCookies
    ? await createCookieSnapshotFingerprint(snapshot)
    : "";
  const cacheFingerprint = hasCurrentCookies
    ? await getCacheCookieFingerprint(snapshot)
    : "";

  let savedProfileId: string | undefined;
  let matchMethod: CurrentAccountMatchMethod = "none";
  let metadata: AccountMetadata | undefined;

  if (currentFingerprint) {
    for (const profile of state.profiles) {
      const payload = state.encryptedSnapshots[profile.encryptedCookieSnapshotId];
      if (!payload) continue;
      try {
        const savedSnapshot = await decryptCookieSnapshot(key, payload);
        const savedFingerprint = await createCookieSnapshotFingerprint(savedSnapshot);

        if (savedFingerprint === currentFingerprint) {
          savedProfileId = profile.id;
          matchMethod = "cookie";

          const timeUntilExpiry = profile.minCookieExpiresAt
            ? profile.minCookieExpiresAt - Date.now() / 1000
            : 0;

          // 若距离过期超过7天，或者没有有效过期时间（旧版本遗留等），可信任本地缓存
          if (!profile.minCookieExpiresAt || timeUntilExpiry > 7 * 24 * 60 * 60) {
            metadata = profileToMetadata(profile);
          }
          break;
        }
      } catch {
        // Corrupt snapshots should not block status checks for other profiles.
      }
    }
  }

  // 若通过 cookie 没有匹配到有效的缓存，必须走 DOM 扫描和后台网络请求
  if (!metadata) {
    metadata = await detectCurrentAccountMetadata(tabId);

    if (!savedProfileId) {
      const identityProfile = findProfileByAccountMetadata(state.profiles, metadata);
      if (identityProfile) {
        savedProfileId = identityProfile.id;
        matchMethod = "identity";
      }
    }
  }

  return {
    status: {
      metadata,
      savedProfileId,
      matchMethod,
      hasCurrentCookies,
      canSave: hasCurrentCookies && metadata.metadataSource !== "unavailable"
    },
    cookieFingerprint: cacheFingerprint
  };
}

async function saveCurrentProfile(payload: { label?: string }): Promise<PublicState> {
  const { state, key } = await getReadyState();
  const label = (payload.label ?? "").trim();
  const snapshot = await captureCurrentCookies();

  if (snapshot.cookies.length === 0) {
    throw new Error("没有读到 ChatGPT/OpenAI cookie，请先登录后再保存");
  }

  const cachedStatus = await getVerifiedCurrentAccountStatusCache(snapshot);
  const metadata = cachedStatus?.status.metadata;

  if (!metadata || !cachedStatus?.status.canSave || metadata.metadataSource === "unavailable") {
    throw new Error("当前账号还没有完成页面预热，请刷新 ChatGPT 页面后再打开弹窗保存");
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
    encryptedCookieSnapshotId: snapshotId,
    minCookieExpiresAt: snapshot.minCookieExpiresAt
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
  let savedProfileId: string;

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
      encryptedCookieSnapshotId: snapshotId,
      minCookieExpiresAt: snapshot.minCookieExpiresAt
    };

    profiles = state.profiles.map((profile, index) =>
      index === existingIndex ? updatedProfile : profile
    );
    savedProfileId = updatedProfile.id;
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
    savedProfileId = baseProfile.id;
  }

  await setStoredState({
    ...state,
    profiles,
    encryptedSnapshots
  });
  currentAccountStatusCache = {
    status: {
      metadata,
      savedProfileId,
      matchMethod: existingMatch?.method ?? "identity",
      hasCurrentCookies: true,
      canSave: true
    },
    cachedAt: new Date().toISOString(),
    cookieFingerprint: await getCacheCookieFingerprint(snapshot)
  };
  await persistCurrentAccountStatusCache(currentAccountStatusCache);

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
        const response = await fetch("https://chatgpt.com/api/auth/session", {
          credentials: "include",
          cache: "no-store",
          headers: {
            accept: "application/json"
          }
        });
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
  await clearCurrentAccountStatusCache();

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
  await clearCurrentAccountStatusCache();

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
  await clearCurrentAccountStatusCache();

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
  await clearCurrentAccountStatusCache();
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
