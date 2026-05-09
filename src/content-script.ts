import type {
  CachedCurrentAccountStatus,
  PublicState,
  RuntimeMessage,
  RuntimeResponse
} from "./shared/types";

const WORKSPACE_PATTERNS = [
  /workspace.+(unavailable|not found|no longer|expired|deactivated)/i,
  /organization.+(not found|no longer|deleted|unavailable)/i,
  /you do not have access/i,
  /you don't have access/i,
  /access denied/i,
  /subscription.+(expired|ended|inactive)/i,
  /billing.+(expired|inactive|cancelled)/i,
  /this workspace is no longer available/i,
  /当前工作区.*(不可用|已解散|已到期)/,
  /组织.*(不存在|已解散|不可用)/,
  /无权访问/
];

let guardShown = false;
let switcherHost: HTMLElement | null = null;
let switcherRoot: ShadowRoot | null = null;
let pageAccountStatusCache: CachedCurrentAccountStatus | null = null;

void installFloatingSwitcher();
scheduleAccountStatusPreload();
scheduleWorkspaceScan();

function scheduleAccountStatusPreload(): void {
  window.setTimeout(() => {
    void preloadCurrentAccountStatus();
  }, 1000);
}

async function preloadCurrentAccountStatus(): Promise<void> {
  const response = await sendMessage<CachedCurrentAccountStatus>({
    type: "PRELOAD_CURRENT_ACCOUNT_STATUS",
    url: location.href
  });

  if (response.ok && response.data) {
    pageAccountStatusCache = response.data;
  }
}

function scheduleWorkspaceScan(): void {
  window.setTimeout(scanWorkspaceStatus, 1200);

  const observer = new MutationObserver(() => {
    window.clearTimeout(scanWorkspaceStatus.timer);
    scanWorkspaceStatus.timer = window.setTimeout(scanWorkspaceStatus, 500);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

scanWorkspaceStatus.timer = 0;

function scanWorkspaceStatus(): void {
  if (guardShown || !document.body) {
    return;
  }

  const text = document.body.innerText.slice(0, 40_000);
  const matched = WORKSPACE_PATTERNS.find((pattern) => pattern.test(text));

  if (!matched) {
    return;
  }

  guardShown = true;
  void sendMessage({
    type: "WORKSPACE_GUARD_DETECTED",
    reason: matched.source,
    url: location.href
  });
  showWorkspaceModal();
}

async function installFloatingSwitcher(): Promise<void> {
  if (document.getElementById("gpt-account-switcher-host")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "gpt-account-switcher-host";
  switcherHost = host;
  switcherRoot = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);
  renderFloatingButton();
}

function renderFloatingButton(): void {
  if (!switcherRoot) {
    return;
  }

  let iconUrl = "";
  try {
    iconUrl = chrome.runtime?.getURL("icons/icon-48.png") || "";
  } catch {
    // Ignore runtime errors gracefully
  }

  switcherRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        max-width: calc(100vw - 36px);
        pointer-events: none;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }
      button:disabled {
        cursor: default;
        opacity: 0.72;
      }
      .fab {
        position: relative;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        padding: 0;
        overflow: hidden;
        border-radius: 14px;
        background: #111a24;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
        pointer-events: auto;
      }
      .fab img {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .fab img.is-hidden { display: none; }
      .fab-fallback {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: #41d6c3;
        font-size: 24px;
        font-weight: 800;
        line-height: 1;
      }
      .panel {
        display: none;
        width: min(310px, calc(100vw - 36px));
        margin-bottom: 12px;
        padding: 12px;
        border: 1px solid rgba(102, 112, 133, 0.25);
        border-radius: 10px;
        background: color-mix(in srgb, Canvas 98%, transparent);
        color: CanvasText;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
        pointer-events: auto;
      }
      .panel.open { display: grid; gap: 10px; }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .title { font-size: 13px; font-weight: 760; }
      .hint { color: #667085; font-size: 12px; line-height: 1.45; }
      .list { display: grid; gap: 8px; }
      .profile {
        position: relative;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        min-height: 56px;
        padding: 10px;
        border: 1px solid rgba(102, 112, 133, 0.18);
        border-radius: 8px;
        background: rgba(102, 112, 133, 0.06);
      }
      .profile.current {
        border-color: rgba(23, 107, 91, 0.38);
        background: rgba(23, 107, 91, 0.08);
      }
      .main { min-width: 0; }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 720;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 6px;
        color: #667085;
        font-size: 11px;
        line-height: 1.35;
      }
      .badge,
      .current-tag {
        border-radius: 999px;
        padding: 2px 7px;
        background: rgba(23, 107, 91, 0.12);
        color: #176b5b;
        font-weight: 760;
      }
      .current-tag {
        background: rgba(37, 99, 235, 0.12);
        color: #2563eb;
      }
      .switch {
        min-width: 56px;
        min-height: 32px;
        border-radius: 6px;
        padding: 5px 10px;
        background: #176b5b;
        color: #fff;
        font-weight: 720;
      }
      .switch.current {
        background: #e8ecf3;
        color: #263041;
      }
    </style>
    <div class="wrap">
      <div id="panel" class="panel">
        <div class="panel-head"><div class="title">GPT Switch</div></div>
        <div class="hint">加载中...</div>
      </div>
      <button id="fab" class="fab" title="GPT Account Switcher">
        <span class="fab-fallback" aria-hidden="true">↔</span>
        ${iconUrl ? `<img src="${escapeAttribute(iconUrl)}" alt="" />` : ""}
      </button>
    </div>
  `;

  const fabImage = switcherRoot.querySelector<HTMLImageElement>("#fab img");

  fabImage?.addEventListener("error", () => {
    fabImage.classList.add("is-hidden");
  });

  switcherRoot.getElementById("fab")?.addEventListener("click", () => {
    const panel = switcherRoot?.getElementById("panel");
    const shouldOpen = !panel?.classList.contains("open");

    if (shouldOpen) {
      openSwitcherPanel();
      return;
    }

    closeSwitcherPanel();
  });
}

function openSwitcherPanel(): void {
  const panel = switcherRoot?.getElementById("panel");

  if (!panel) {
    return;
  }

  panel.classList.add("open");
  document.addEventListener("pointerdown", handleOutsideSwitcherClick, true);
  document.addEventListener("keydown", handleSwitcherKeydown, true);
  void renderProfileList();
}

function closeSwitcherPanel(): void {
  switcherRoot?.getElementById("panel")?.classList.remove("open");
  document.removeEventListener("pointerdown", handleOutsideSwitcherClick, true);
  document.removeEventListener("keydown", handleSwitcherKeydown, true);
}

function handleOutsideSwitcherClick(event: PointerEvent): void {
  if (switcherHost && event.composedPath().includes(switcherHost)) {
    return;
  }

  closeSwitcherPanel();
}

function handleSwitcherKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeSwitcherPanel();
  }
}

async function renderProfileList(): Promise<void> {
  const panel = switcherRoot?.getElementById("panel");

  if (!panel) {
    return;
  }

  const [stateResponse, cachedStatusResponse] = await Promise.all([
    sendMessage<PublicState>({ type: "GET_STATE" }),
    sendMessage<CachedCurrentAccountStatus | null>({
      type: "GET_CACHED_CURRENT_ACCOUNT_STATUS"
    })
  ]);

  if (!stateResponse.ok || !stateResponse.data?.hasVault) {
    panel.innerHTML = `<div class="panel-head"><div class="title">GPT Switch</div></div><div class="hint">请先打开扩展弹窗初始化本地数据。</div>`;
    return;
  }

  if (!stateResponse.data.unlocked) {
    panel.innerHTML = `<div class="panel-head"><div class="title">GPT Switch</div></div><div class="hint">本地数据暂不可用，请重新打开扩展弹窗。</div>`;
    return;
  }

  if (stateResponse.data.profiles.length === 0) {
    panel.innerHTML = `<div class="panel-head"><div class="title">GPT Switch</div></div><div class="hint">还没有保存账号。登录后去扩展弹窗保存一个吧。</div>`;
    return;
  }

  const publicState = stateResponse.data;
  const cachedStatus =
    cachedStatusResponse.ok && cachedStatusResponse.data
      ? cachedStatusResponse.data
      : pageAccountStatusCache;

  renderPanelProfiles(panel, publicState.profiles, cachedStatus?.status.savedProfileId);
}

function renderPanelProfiles(
  panel: HTMLElement,
  profiles: PublicState["profiles"],
  currentProfileId?: string
): void {
  panel.innerHTML = `
    <div class="panel-head"><div class="title">GPT Switch</div></div>
    <div class="list">
    ${profiles
      .map((profile) => {
        const title = getProfileTitle(profile);
        const scope = isTeamProfile(profile)
          ? `Team: ${profile.workspaceName || "未知"}`
          : "Personal";
        const validity = getValidityLabel(profile.subscriptionExpiresAt);
        const isCurrent = profile.id === currentProfileId;

        return `
          <div class="profile ${isCurrent ? "current" : ""}">
            <div class="main">
              <div class="name" title="${escapeAttribute(title)}">${escapeHtml(title)}</div>
              <div class="meta">
                <span class="badge">${escapeHtml(getPlanLabel(profile))}</span>
                <span>${escapeHtml(scope)}</span>
                <span>${escapeHtml(validity)}</span>
                ${isCurrent ? `<span class="current-tag">当前</span>` : ""}
              </div>
            </div>
            <button class="switch ${isCurrent ? "current" : ""}" data-profile-id="${escapeAttribute(profile.id)}" ${isCurrent ? "disabled" : ""}>${isCurrent ? "当前" : "切换"}</button>
          </div>
        `;
      })
      .join("")}
    </div>
  `;

  bindPanelSwitchButtons(panel);
}

function bindPanelSwitchButtons(panel: HTMLElement): void {
  for (const button of panel.querySelectorAll<HTMLButtonElement>(".switch")) {
    button.addEventListener("click", async () => {
      const profileId = button.dataset.profileId;

      if (!profileId) {
        return;
      }

      button.disabled = true;
      button.textContent = "切换中";
      const result = await sendMessage({ type: "SWITCH_PROFILE", profileId });

      if (!result.ok) {
        button.disabled = false;
        button.textContent = "失败";
        window.setTimeout(() => {
          button.textContent = "切换";
        }, 1600);
        return;
      }

      closeSwitcherPanel();
    });
  }
}

function showWorkspaceModal(): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.38);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    width: min(360px, calc(100vw - 32px));
    border-radius: 8px;
    padding: 18px;
    background: Canvas;
    color: CanvasText;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
  `;
  modal.innerHTML = `
    <div style="font-size:16px;font-weight:760;margin-bottom:8px;">当前工作区不可用</div>
    <div style="font-size:13px;line-height:1.55;color:#667085;margin-bottom:14px;">
      可能是工作区到期、解散或当前账号没有权限。要切回已保存的个人账号吗？
    </div>
    <div style="display:flex;gap:8px;">
      <button id="gpt-switch-personal" style="flex:1;min-height:36px;border:0;border-radius:6px;background:#176b5b;color:white;font-weight:700;cursor:pointer;">切回个人账号</button>
      <button id="gpt-switch-dismiss" style="flex:1;min-height:36px;border:0;border-radius:6px;background:#e8ecf3;color:#263041;font-weight:700;cursor:pointer;">稍后</button>
    </div>
    <div id="gpt-switch-result" style="min-height:18px;margin-top:10px;font-size:12px;color:#bd3b3b;"></div>
  `;
  overlay.append(modal);
  document.documentElement.append(overlay);

  modal.querySelector("#gpt-switch-dismiss")?.addEventListener("click", () => {
    overlay.remove();
  });

  modal.querySelector("#gpt-switch-personal")?.addEventListener("click", async () => {
    const button = modal.querySelector<HTMLButtonElement>("#gpt-switch-personal");
    const resultNode = modal.querySelector<HTMLDivElement>("#gpt-switch-result");

    if (button) {
      button.disabled = true;
      button.textContent = "切换中...";
    }

    const response = await sendMessage({ type: "SWITCH_DEFAULT_PERSONAL" });

    if (!response.ok && resultNode) {
      resultNode.textContent = response.error ?? "切换失败，请打开扩展弹窗检查。";
      if (button) {
        button.disabled = false;
        button.textContent = "切回个人账号";
      }
    }
  });
}

function sendMessage<T = unknown>(
  message: RuntimeMessage
): Promise<RuntimeResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T> | undefined) => {
      const error = chrome.runtime.lastError;

      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve(response ?? { ok: false, error: "扩展后台没有响应" });
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function getProfileTitle(profile: PublicState["profiles"][number]): string {
  return (
    profile.email ||
    profile.displayName ||
    profile.label ||
    profile.emailHint ||
    "未知账号"
  );
}

function getPlanLabel(profile: PublicState["profiles"][number]): string {
  if (profile.planLabel) {
    return profile.planLabel;
  }

  const labels: Record<string, string> = {
    free: "FREE",
    plus: "PLUS",
    pro: "PRO",
    team: "TEAM",
    business: "BUSINESS",
    enterprise: "ENTERPRISE",
    edu: "EDU",
    unknown: "UNKNOWN"
  };

  return labels[profile.planType || "unknown"] || "UNKNOWN";
}

function getValidityLabel(value: string | undefined): string {
  if (!value) {
    return "有效期未知";
  }

  const expiry = new Date(value);

  if (Number.isNaN(expiry.getTime())) {
    return "有效期未知";
  }

  const remainingDays = Math.ceil(
    (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  if (remainingDays < 0) {
    return "已过期";
  }

  return `有效期 ${remainingDays}天`;
}

function isTeamProfile(profile: PublicState["profiles"][number]): boolean {
  return (
    profile.type === "workspace" ||
    profile.planType === "team" ||
    profile.planType === "business" ||
    profile.planType === "enterprise" ||
    profile.planType === "edu"
  );
}
