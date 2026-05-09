import { getValidityView } from "../shared/dates";
import {
  getPlanLabel,
  getProfileLabel,
  getProfileTitle,
  isTeamProfile
} from "../shared/profileHelpers";
import type {
  AccountMetadata,
  CurrentAccountStatus,
  Profile,
  PublicState,
  RuntimeMessage,
  RuntimeResponse,
  StoredState
} from "../shared/types";

type AccountStatusState =
  | { status: "loading" }
  | { status: "success"; value: CurrentAccountStatus }
  | { status: "error"; error: string };

const app = document.getElementById("app");
let state: PublicState | null = null;
let accountStatus: AccountStatusState = { status: "loading" };
let message = "";
let isError = false;

void refresh();

async function refresh(): Promise<void> {
  const response = await sendMessage<PublicState>({ type: "GET_STATE" });

  if (!response.ok || !response.data) {
    renderShell(null);
    setMessage(response.error ?? "读取扩展状态失败", true);
    return;
  }

  state = response.data;
  accountStatus = { status: "loading" };
  renderShell(state);
  void refreshCurrentAccountStatus();
}

async function refreshCurrentAccountStatus(): Promise<void> {
  const response = await sendMessage<CurrentAccountStatus>({
    type: "GET_CURRENT_ACCOUNT_STATUS"
  });

  if (response.ok && response.data) {
    accountStatus = { status: "success", value: response.data };
  } else {
    accountStatus = {
      status: "error",
      error: response.error ?? "检测当前账号失败"
    };
  }

  renderShellPreservingDraft(state);
}

function renderShell(current: PublicState | null): void {
  if (!app) {
    return;
  }

  const currentProfileId =
    accountStatus.status === "success"
      ? accountStatus.value.savedProfileId
      : undefined;

  app.innerHTML = layout(`
    <div class="panel">
      ${renderProfileList(current?.profiles ?? [], currentProfileId)}
      ${renderCurrentAccountSection(current)}
      ${renderVaultTools(current)}
    </div>
  `);
  bindBaseActions();
  bindProfileActions();
  bindSaveProfile();
  bindVaultTools();
}

function renderShellPreservingDraft(current: PublicState | null): void {
  const labelDraft = inputValue("profile-label");
  renderShell(current);

  if (labelDraft) {
    const labelInput = document.querySelector<HTMLInputElement>("#profile-label");

    if (labelInput) {
      labelInput.value = labelDraft;
    }
  }
}

function layout(content: string): string {
  return `
    <div class="topbar">
      <div>
        <h1 class="title">GPT Switch</h1>
        <div class="subtle">本地加密保存 ChatGPT 会话快照，一键换号</div>
      </div>
      <button id="refresh-detection" class="icon-btn" title="重新检测当前账号">↻</button>
    </div>
    <div id="message" class="message ${isError ? "error" : ""}">${escapeHtml(message)}</div>
    ${content}
  `;
}

function renderProfileList(profiles: Profile[], currentProfileId?: string): string {
  if (profiles.length === 0) {
    return `
      <div class="box empty">
        <div class="empty-title">还没有保存账号</div>
        <div class="subtle">打开 ChatGPT 并登录后，这里会提示你保存当前账号。</div>
      </div>
    `;
  }

  return `
    <div class="profile-list">
      ${profiles
        .map((profile) => renderProfileCard(profile, profile.id === currentProfileId))
        .join("")}
    </div>
  `;
}

function renderProfileCard(profile: Profile, isCurrent: boolean): string {
  const label = getProfileLabel(profile);
  const title = getProfileTitle(profile);
  const planLabel = getPlanLabel(profile);
  const scope = renderProfileScope(profile);
  const tags = [
    isCurrent ? `<span class="current-tag">当前</span>` : "",
    label
      ? `<span class="corner-tag" title="${escapeAttribute(label)}">${escapeHtml(label)}</span>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  return `
    <article class="profile-card ${isCurrent ? "current" : ""}" style="--profile-color:${escapeAttribute(profile.color)}">
      <span class="color-bar" aria-hidden="true"></span>
      ${tags ? `<div class="corner-tags">${tags}</div>` : ""}
      <div class="profile-title" title="${escapeAttribute(title)}">${escapeHtml(title)}</div>
      <div class="profile-meta">
        <span class="plan-badge">${escapeHtml(planLabel)}</span>
        <span>${scope}</span>
      </div>
      ${renderValidity(profile)}
      <div class="time-row">
        <span>保存 ${formatDate(profile.capturedAt)}</span>
        ${profile.lastUsedAt ? `<span>使用 ${formatDate(profile.lastUsedAt)}</span>` : ""}
      </div>
      <div class="profile-actions">
        <button class="btn" data-action="switch" data-profile-id="${escapeAttribute(profile.id)}">切换</button>
        <button class="btn danger" data-action="delete" data-profile-id="${escapeAttribute(profile.id)}">删除</button>
      </div>
    </article>
  `;
}

function renderCurrentAccountSection(current: PublicState | null): string {
  if (accountStatus.status === "loading") {
    return `
      <section class="box">
        <div class="section-title">当前账号</div>
        <div class="detected-card pending">
          <div class="detected-title">正在检测当前账号...</div>
          <div class="subtle">会尝试读取页面、session、JWT claim 和本地 cookie。</div>
        </div>
      </section>
    `;
  }

  if (accountStatus.status === "error") {
    return `
      <section class="box">
        <div class="section-title">当前账号</div>
        <div class="detected-card warning">
          <div class="detected-title">检测失败</div>
          <div class="subtle">${escapeHtml(accountStatus.error)}</div>
        </div>
      </section>
    `;
  }

  const status = accountStatus.value;
  const savedProfile = current?.profiles.find(
    (profile) => profile.id === status.savedProfileId
  );

  if (savedProfile) {
    return `
      <section class="box saved-current">
        <div class="section-title">当前账号已保存</div>
        ${renderAccountSummary(status.metadata, savedProfile)}
        <div class="subtle">无需重复保存。匹配方式：${escapeHtml(renderMatchMethod(status.matchMethod))}</div>
      </section>
    `;
  }

  if (!status.hasCurrentCookies) {
    return `
      <section class="box">
        <div class="section-title">当前账号</div>
        <div class="detected-card warning">
          <div class="detected-title">没有读到 ChatGPT 登录 cookie</div>
          <div class="subtle">请先在 ChatGPT 页面登录账号，再回来保存。小饺子还没下锅。</div>
        </div>
      </section>
    `;
  }

  if (!status.canSave) {
    return `
      <section class="box">
        <div class="section-title">当前账号</div>
        ${renderAccountSummary(status.metadata)}
        <div class="subtle">账号信息检测失败，暂不保存 cookie 快照。请打开或刷新 ChatGPT 页面后重试。</div>
      </section>
    `;
  }

  return `
    <section class="box">
      <div class="section-title">保存当前账号</div>
      ${renderAccountSummary(status.metadata)}
      <div class="field">
        <label for="profile-label">账号标签（可空）</label>
        <input id="profile-label" class="input" maxlength="36" placeholder="例如：公司号 / 备用号" />
      </div>
      <button id="save-profile" class="btn">保存当前账号</button>
    </section>
  `;
}

function renderAccountSummary(metadata: AccountMetadata, profile?: Profile): string {
  const title =
    metadata.email ||
    profile?.email ||
    metadata.displayName ||
    profile?.displayName ||
    profile?.label ||
    "未识别账号";
  const planLabel =
    metadata.planLabel && metadata.planLabel !== "UNKNOWN"
      ? metadata.planLabel
      : profile
        ? getPlanLabel(profile)
        : "UNKNOWN";
  const workspaceName = metadata.workspaceName || profile?.workspaceName || "";
  const scope = workspaceName
    ? `Team Name: ${workspaceName}`
    : profile
      ? renderProfileScope(profile).replace(/<[^>]*>/g, "")
      : "Personal";
  const expiry = metadata.subscriptionExpiresAt || profile?.subscriptionExpiresAt || "";
  const validity = getValidityView(expiry);
  const warning =
    metadata.metadataSource === "unavailable" || metadata.error ? " warning" : "";

  return `
    <div class="detected-card${warning}">
      <div class="detected-title">${escapeHtml(title)}</div>
      <div class="detected-grid">
        <span class="plan-badge">${escapeHtml(planLabel)}</span>
        <span>${escapeHtml(scope)}</span>
        <span>${escapeHtml(validity.label)}</span>
      </div>
      <div class="subtle">来源：${escapeHtml(metadata.metadataSource)}${metadata.error ? ` · ${escapeHtml(metadata.error)}` : ""}</div>
    </div>
  `;
}

function renderVaultTools(current: PublicState | null): string {
  return `
    <section class="box tools">
      <button id="rollback" class="btn secondary" ${current?.hasRollback ? "" : "disabled"}>回滚上次切换</button>
      <button id="export-vault" class="btn ghost">导出备份</button>
      <button id="import-vault" class="btn ghost">导入备份</button>
      <input id="import-file" class="hidden" type="file" accept="application/json,.json" />
    </section>
  `;
}

function bindBaseActions(): void {
  document.getElementById("refresh-detection")?.addEventListener("click", () => {
    accountStatus = { status: "loading" };
    renderShellPreservingDraft(state);
    void refreshCurrentAccountStatus();
  });
}

function bindProfileActions(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    button.addEventListener("click", async () => {
      const profileId = button.dataset.profileId;
      const action = button.dataset.action;

      if (!profileId) {
        return;
      }

      if (action === "switch") {
        await sendAndRefresh({ type: "SWITCH_PROFILE", profileId }, "切换完成");
        return;
      }

      if (action === "delete") {
        if (!confirm("确定删除这个账号快照吗？这个动作不能撤销。")) {
          return;
        }

        await sendAndRefresh({ type: "DELETE_PROFILE", profileId }, "已删除账号");
      }
    });
  }
}

function bindSaveProfile(): void {
  document.getElementById("save-profile")?.addEventListener("click", async () => {
    const label = inputValue("profile-label");

    await sendAndRefresh(
      {
        type: "SAVE_CURRENT_PROFILE",
        payload: { label }
      },
      "当前账号已保存"
    );
  });
}

function bindVaultTools(): void {
  document.getElementById("rollback")?.addEventListener("click", async () => {
    await sendAndRefresh({ type: "ROLLBACK_LAST_SWITCH" }, "已回滚上次切换");
  });

  document.getElementById("export-vault")?.addEventListener("click", exportVault);
  bindImport();
}

async function exportVault(): Promise<void> {
  const response = await sendMessage<StoredState>({ type: "EXPORT_VAULT" });

  if (!response.ok || !response.data) {
    setMessage(response.error ?? "导出失败", true);
    return;
  }

  const blob = new Blob([JSON.stringify(response.data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gpt-switch-vault-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setMessage("已导出加密备份", false);
}

function bindImport(): void {
  const button = document.getElementById("import-vault");
  const fileInput = document.querySelector<HTMLInputElement>("#import-file");

  button?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    await sendAndRefresh({ type: "IMPORT_VAULT", payload: parsed }, "已导入");
  });
}

async function sendAndRefresh(
  request: RuntimeMessage,
  successMessage: string
): Promise<void> {
  const response = await sendMessage<PublicState>(request);

  if (!response.ok) {
    setMessage(response.error ?? "操作失败", true);
    return;
  }

  state = response.data ?? state;
  message = successMessage;
  isError = false;
  accountStatus = { status: "loading" };
  renderShell(state);
  void refreshCurrentAccountStatus();
}

function sendMessage<T = unknown>(
  request: RuntimeMessage
): Promise<RuntimeResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: RuntimeResponse<T> | undefined) => {
      const error = chrome.runtime.lastError;

      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve(response ?? { ok: false, error: "扩展后台没有响应" });
    });
  });
}

function inputValue(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
}

function setMessage(value: string, error: boolean): void {
  message = value;
  isError = error;
  const node = document.getElementById("message");

  if (node) {
    node.textContent = value;
    node.classList.toggle("error", error);
  }
}

function renderProfileScope(profile: Profile): string {
  if (isTeamProfile(profile)) {
    return `Team Name: ${escapeHtml(profile.workspaceName || "未知")}`;
  }

  return "Personal";
}

function renderValidity(profile: Profile): string {
  const warnings: string[] = [];

  if (profile.minCookieExpiresAt) {
    const timeUntilExpiry = profile.minCookieExpiresAt - (Date.now() / 1000);
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    if (timeUntilExpiry < sevenDaysInSeconds) {
      warnings.push(`<div class="validity warning">⚠️ 核心状态即将过期，请切换登录后重新保存</div>`);
    }
  }

  const shouldShow =
    Boolean(profile.subscriptionExpiresAt) ||
    Boolean(profile.isPaidAccount) ||
    Boolean(profile.planType && profile.planType !== "free" && profile.planType !== "unknown");

  if (!shouldShow) {
    return warnings.join("");
  }

  const view = getValidityView(profile.subscriptionExpiresAt);
  const percent = getValidityPercent(profile.subscriptionExpiresAt, view.status);

  return `
    ${warnings.join("")}
    <div class="validity ${view.status === "expired" ? "expired" : ""} ${view.status === "unknown" ? "unknown" : ""}">
      <div class="validity-line">
        <strong>${escapeHtml(view.label)}</strong>
        <span>${escapeHtml(view.exact || "未解析到日期")}</span>
      </div>
      <span class="validity-track"><span style="width:${percent}%"></span></span>
    </div>
  `;
}

function renderMatchMethod(method: CurrentAccountStatus["matchMethod"]): string {
  if (method === "identity") {
    return "账号信息";
  }

  if (method === "cookie") {
    return "cookie 快照";
  }

  return "未匹配";
}

function getValidityPercent(value: string | undefined, status: string): number {
  if (status === "expired") {
    return 100;
  }

  if (status === "unknown" || !value) {
    return 18;
  }

  const expiry = new Date(value);

  if (Number.isNaN(expiry.getTime())) {
    return 18;
  }

  const remainingDays = Math.ceil(
    (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  return Math.max(8, Math.min(100, Math.round((remainingDays / 30) * 100)));
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
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
