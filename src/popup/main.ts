import type {
  Profile,
  ProfileType,
  PublicState,
  RuntimeMessage,
  RuntimeResponse,
  StoredState
} from "../shared/types";

const app = document.getElementById("app");
let state: PublicState | null = null;
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
  renderShell(state);
}

function renderShell(current: PublicState | null): void {
  if (!app) {
    return;
  }

  if (!current?.hasVault) {
    app.innerHTML = layout(`
      <div class="box">
        <div class="subtle" style="margin-bottom:10px;">第一次使用需要创建本地保险箱。口令不会保存，忘了就只能重新登录保存账号，别让脑袋离家出走。</div>
        <div class="field">
          <label for="new-password">保险箱口令</label>
          <input id="new-password" class="input" type="password" autocomplete="new-password" placeholder="至少 8 个字符" />
        </div>
        <div class="field">
          <label for="new-password-confirm">确认口令</label>
          <input id="new-password-confirm" class="input" type="password" autocomplete="new-password" />
        </div>
        <button id="create-vault" class="btn">创建保险箱</button>
      </div>
    `);
    bindBaseActions();
    document.getElementById("create-vault")?.addEventListener("click", createVault);
    return;
  }

  if (!current.unlocked) {
    app.innerHTML = layout(`
      <div class="box">
        <div class="subtle" style="margin-bottom:10px;">输入口令解锁后才能保存或切换账号。</div>
        <div class="field">
          <label for="password">保险箱口令</label>
          <input id="password" class="input" type="password" autocomplete="current-password" />
        </div>
        <button id="unlock-vault" class="btn">解锁</button>
      </div>
      <div class="box">
        <button id="import-vault" class="btn ghost">导入加密备份</button>
        <input id="import-file" class="hidden" type="file" accept="application/json,.json" />
      </div>
    `);
    bindBaseActions();
    document.getElementById("unlock-vault")?.addEventListener("click", unlockVault);
    bindImport();
    return;
  }

  app.innerHTML = layout(`
    <div class="panel">
      ${renderProfileList(current.profiles)}
      ${renderSaveProfileForm()}
      ${renderVaultTools(current)}
    </div>
  `);
  bindBaseActions();
  bindProfileActions();
  bindSaveProfile();
  bindVaultTools();
}

function layout(content: string): string {
  return `
    <div class="topbar">
      <div>
        <h1 class="title">GPT Switch</h1>
        <div class="subtle">本地加密保存 ChatGPT 会话快照</div>
      </div>
      ${state?.unlocked ? `<button id="lock-vault" class="btn secondary" style="flex:0;">锁定</button>` : ""}
    </div>
    <div id="message" class="message ${isError ? "error" : ""}">${escapeHtml(message)}</div>
    ${content}
  `;
}

function renderProfileList(profiles: Profile[]): string {
  if (profiles.length === 0) {
    return `
      <div class="box empty">
        <div style="font-weight:740;margin-bottom:4px;">还没有保存账号</div>
        <div class="subtle">先手动登录 ChatGPT，然后点下面的“保存当前账号”。</div>
      </div>
    `;
  }

  return `
    <div class="box">
      ${profiles
        .map(
          (profile) => `
            <div class="profile">
              <span class="dot" style="background:${escapeAttribute(profile.color)}"></span>
              <div>
                <div class="profile-title">
                  <span>${escapeHtml(profile.label)}</span>
                  ${profile.isDefaultPersonal ? `<span class="tag">个人默认</span>` : `<span class="tag">${profileTypeLabel(profile.type)}</span>`}
                </div>
                <div class="subtle">${escapeHtml(profile.emailHint || "未填写邮箱提示")} · 保存于 ${formatDate(profile.capturedAt)}</div>
                <div class="profile-actions">
                  <button class="btn" data-action="switch" data-profile-id="${escapeAttribute(profile.id)}">切换</button>
                  <button class="btn secondary" data-action="default" data-profile-id="${escapeAttribute(profile.id)}">设为个人</button>
                  <button class="btn danger" data-action="delete" data-profile-id="${escapeAttribute(profile.id)}">删除</button>
                </div>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSaveProfileForm(): string {
  return `
    <div class="box">
      <div style="font-weight:740;margin-bottom:10px;">保存当前账号</div>
      <div class="field">
        <label for="profile-label">账号标签</label>
        <input id="profile-label" class="input" placeholder="例如：个人号 / 公司号" />
      </div>
      <div class="field">
        <label for="profile-email">邮箱提示</label>
        <input id="profile-email" class="input" placeholder="可选，只作本地备注" />
      </div>
      <div class="row">
        <div class="field">
          <label for="profile-type">类型</label>
          <select id="profile-type" class="select">
            <option value="normal">普通</option>
            <option value="personal">个人</option>
            <option value="workspace">工作区</option>
          </select>
        </div>
        <div class="field">
          <label for="profile-color">颜色</label>
          <input id="profile-color" class="input" type="color" value="#176b5b" />
        </div>
      </div>
      <label class="row" style="justify-content:flex-start;margin-bottom:10px;">
        <input id="profile-default" type="checkbox" style="flex:0;" />
        <span class="subtle">设为工作区异常时回退的个人账号</span>
      </label>
      <button id="save-profile" class="btn">保存当前账号</button>
    </div>
  `;
}

function renderVaultTools(current: PublicState): string {
  return `
    <div class="box">
      <div class="row">
        <button id="rollback" class="btn secondary" ${current.hasRollback ? "" : "disabled"}>回滚上次切换</button>
        <button id="export-vault" class="btn ghost">导出备份</button>
      </div>
      <div style="height:8px;"></div>
      <button id="import-vault" class="btn ghost">导入加密备份</button>
      <input id="import-file" class="hidden" type="file" accept="application/json,.json" />
    </div>
  `;
}

function bindBaseActions(): void {
  document.getElementById("lock-vault")?.addEventListener("click", async () => {
    await sendAndRefresh({ type: "LOCK_VAULT" }, "已锁定");
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

      if (action === "default") {
        await sendAndRefresh(
          { type: "SET_DEFAULT_PERSONAL", profileId },
          "已设为个人默认账号"
        );
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
    const emailHint = inputValue("profile-email");
    const color = inputValue("profile-color") || "#176b5b";
    const profileType = inputValue("profile-type") as ProfileType;
    const isDefaultPersonal =
      document.querySelector<HTMLInputElement>("#profile-default")?.checked ?? false;

    await sendAndRefresh(
      {
        type: "SAVE_CURRENT_PROFILE",
        payload: {
          label,
          emailHint,
          color,
          profileType,
          isDefaultPersonal
        }
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

async function createVault(): Promise<void> {
  const password = inputValue("new-password");
  const confirmPassword = inputValue("new-password-confirm");

  if (password !== confirmPassword) {
    setMessage("两次口令不一致", true);
    return;
  }

  await sendAndRefresh({ type: "SETUP_VAULT", password }, "保险箱已创建");
}

async function unlockVault(): Promise<void> {
  await sendAndRefresh(
    { type: "UNLOCK_VAULT", password: inputValue("password") },
    "已解锁"
  );
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
    await sendAndRefresh({ type: "IMPORT_VAULT", payload: parsed }, "已导入，请重新解锁");
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
  renderShell(state);
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
  return document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? "";
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

function profileTypeLabel(type: ProfileType): string {
  if (type === "personal") {
    return "个人";
  }

  if (type === "workspace") {
    return "工作区";
  }

  return "普通";
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
