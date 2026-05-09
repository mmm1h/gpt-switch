import type { PublicState, RuntimeMessage, RuntimeResponse } from "./shared/types";

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
let switcherRoot: ShadowRoot | null = null;

void installFloatingSwitcher();
scheduleWorkspaceScan();

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
  switcherRoot = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);
  renderFloatingButton();
}

function renderFloatingButton(): void {
  if (!switcherRoot) {
    return;
  }

  switcherRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }
      .fab {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        background: #176b5b;
        color: white;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
        font-weight: 760;
      }
      .panel {
        display: none;
        width: 260px;
        margin-bottom: 10px;
        padding: 10px;
        border: 1px solid rgba(102, 112, 133, 0.25);
        border-radius: 8px;
        background: color-mix(in srgb, Canvas 96%, transparent);
        color: CanvasText;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
      }
      .panel.open { display: grid; gap: 8px; }
      .title { font-size: 13px; font-weight: 760; }
      .hint { color: #667085; font-size: 12px; line-height: 1.45; }
      .profile {
        display: grid;
        grid-template-columns: 10px 1fr auto;
        align-items: center;
        gap: 8px;
        min-height: 34px;
      }
      .dot { width: 9px; height: 9px; border-radius: 999px; }
      .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
      .switch {
        min-height: 28px;
        border-radius: 6px;
        padding: 4px 8px;
        background: #e8ecf3;
        color: #263041;
      }
    </style>
    <div class="wrap">
      <div id="panel" class="panel">
        <div class="title">GPT Switch</div>
        <div class="hint">加载中...</div>
      </div>
      <button id="fab" class="fab" title="GPT Account Switcher">GPT</button>
    </div>
  `;

  switcherRoot.getElementById("fab")?.addEventListener("click", () => {
    const panel = switcherRoot?.getElementById("panel");
    panel?.classList.toggle("open");

    if (panel?.classList.contains("open")) {
      void renderProfileList();
    }
  });
}

async function renderProfileList(): Promise<void> {
  const panel = switcherRoot?.getElementById("panel");

  if (!panel) {
    return;
  }

  const response = await sendMessage<PublicState>({ type: "GET_STATE" });

  if (!response.ok || !response.data?.hasVault) {
    panel.innerHTML = `<div class="title">GPT Switch</div><div class="hint">请先打开扩展弹窗创建保险箱。</div>`;
    return;
  }

  if (!response.data.unlocked) {
    panel.innerHTML = `<div class="title">GPT Switch</div><div class="hint">保险箱还没解锁，先点浏览器扩展图标输口令。</div>`;
    return;
  }

  if (response.data.profiles.length === 0) {
    panel.innerHTML = `<div class="title">GPT Switch</div><div class="hint">还没有保存账号。登录后去扩展弹窗保存一个吧。</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="title">GPT Switch</div>
    ${response.data.profiles
      .map(
        (profile) => `
          <div class="profile">
            <span class="dot" style="background:${escapeAttribute(profile.color)}"></span>
            <span class="name" title="${escapeAttribute(profile.label)}">${escapeHtml(profile.label)}</span>
            <button class="switch" data-profile-id="${escapeAttribute(profile.id)}">切换</button>
          </div>
        `
      )
      .join("")}
  `;

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
      }
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
      可能是工作区到期、解散或当前账号没有权限。要切回你标记的个人账号吗？
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
