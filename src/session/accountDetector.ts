import {
  normalizePlanType,
  planLabelFor
} from "../shared/profileHelpers";
import { normalizeSubscriptionExpiry } from "../shared/jwtClaims";
import type { AccountMetadata, MetadataSource, PlanType } from "../shared/types";

const CHATGPT_TAB_PATTERNS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*"
];

export async function detectCurrentAccountMetadata(tabId?: number): Promise<AccountMetadata> {
  const targetTabId = tabId ?? (await getPrimaryChatGptTab())?.id;

  if (!targetTabId) {
    return createUnavailableMetadata("没有打开的 ChatGPT 页面");
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: detectAccountMetadataInPage
    });

    return normalizeDetectedMetadata(result?.result);
  } catch (error) {
    return createUnavailableMetadata(formatError(error));
  }
}

function normalizeDetectedMetadata(value: unknown): AccountMetadata {
  if (!value || typeof value !== "object") {
    return createUnavailableMetadata("没有检测到账号信息");
  }

  const raw = value as Partial<AccountMetadata>;
  const planType = normalizePlanType(raw.planType || raw.planLabel);

  return {
    email: normalizeText(raw.email),
    displayName: normalizeText(raw.displayName),
    planType,
    planLabel: planLabelFor(planType, raw.planLabel),
    workspaceName: normalizeText(raw.workspaceName),
    subscriptionExpiresAt: normalizeDate(raw.subscriptionExpiresAt),
    metadataDetectedAt: raw.metadataDetectedAt || new Date().toISOString(),
    metadataSource: raw.metadataSource || "fallback",
    accountId: normalizeText(raw.accountId),
    organizationId: normalizeText(raw.organizationId),
    userId: normalizeText(raw.userId),
    error: normalizeText(raw.error)
  };
}

function createUnavailableMetadata(error: string): AccountMetadata {
  return {
    email: "",
    displayName: "",
    planType: "unknown",
    planLabel: "UNKNOWN",
    workspaceName: "",
    subscriptionExpiresAt: "",
    metadataDetectedAt: new Date().toISOString(),
    metadataSource: "unavailable",
    error
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value: unknown): string {
  return normalizeSubscriptionExpiry(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getPrimaryChatGptTab(): Promise<chrome.tabs.Tab | null> {
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

  return anyTab ?? null;
}

async function detectAccountMetadataInPage(): Promise<AccountMetadata> {
  const now = new Date().toISOString();
  const planMap: Record<string, string> = {
    free: "FREE",
    plus: "PLUS",
    pro: "PRO",
    team: "TEAM",
    business: "BUSINESS",
    enterprise: "ENTERPRISE",
    edu: "EDU"
  };
  const result: AccountMetadata = {
    email: "",
    displayName: "",
    planType: "unknown",
    planLabel: "UNKNOWN",
    workspaceName: "",
    subscriptionExpiresAt: "",
    metadataDetectedAt: now,
    metadataSource: "fallback"
  };
  let sessionAccessToken = "";
  const ignoredTexts = new Set([
    "new chat",
    "search chats",
    "chatgpt",
    "settings",
    "upgrade",
    "my plan",
    "upgrade plan",
    "customize chatgpt",
    "keyboard shortcuts",
    "help",
    "log out",
    "logout",
    "personal",
    "personal account",
    "personal workspace",
    "launch a workspace"
  ]);

  const normalize = (value: unknown): string =>
    String(value ?? "").replace(/\s+/g, " ").trim();
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const openAiAuthClaim = "https://api.openai.com/auth";
  const openAiProfileClaim = "https://api.openai.com/profile";
  const getPlanKey = (value: unknown): PlanType => {
    const normalized = normalize(value).toLowerCase();

    if (!normalized) {
      return "unknown";
    }

    if (/\benterprise\b/.test(normalized)) {
      return "enterprise";
    }

    if (/\b(edu|education)\b/.test(normalized)) {
      return "edu";
    }

    if (/\bbusiness\b/.test(normalized)) {
      return "business";
    }

    if (/\b(team|teams|workspace)\b/.test(normalized)) {
      return "team";
    }

    if (/\bpro\b/.test(normalized)) {
      return "pro";
    }

    if (/\bplus\b/.test(normalized)) {
      return "plus";
    }

    if (/\bfree\b/.test(normalized)) {
      return "free";
    }

    return "unknown";
  };
  const setSource = (source: MetadataSource): void => {
    if (result.metadataSource === "fallback") {
      result.metadataSource = source;
    }
  };
  const appendSource = (source: MetadataSource): void => {
    const parts = result.metadataSource === "fallback"
      ? []
      : result.metadataSource.split("+");

    if (!parts.includes(source)) {
      result.metadataSource = [...parts, source].join("+") || source;
    }
  };
  const setPlan = (value: unknown): void => {
    const planType = getPlanKey(value);

    if (planType === "unknown") {
      return;
    }

    result.planType = planType;
    result.planLabel = planMap[planType] ?? "UNKNOWN";
  };
  const setEmailFromText = (text: string): void => {
    if (result.email) {
      return;
    }

    const match = normalize(text).match(emailRegex);

    if (match) {
      result.email = match[0];
    }
  };
  const normalizeExpiryDate = (value: unknown): string => {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())
          ? Number(value.trim())
          : Number.NaN;
    const date =
      Number.isFinite(numeric) && numeric > 0
        ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
        : new Date(normalize(value));

    if (Number.isNaN(date.getTime()) || date.getFullYear() <= 2020) {
      return "";
    }

    return date.toISOString();
  };
  const decodeBase64Url = (value: string): string => {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const decodeJwtPayload = (token: unknown): Record<string, unknown> | null => {
    const parts = String(token ?? "").split(".");

    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    try {
      const parsed = JSON.parse(decodeBase64Url(parts[1])) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const applyJwtToken = (token: unknown): void => {
    const payload = decodeJwtPayload(token);

    if (!payload) {
      return;
    }

    const auth = payload[openAiAuthClaim] as Record<string, unknown> | undefined;
    const profile = payload[openAiProfileClaim] as Record<string, unknown> | undefined;
    const email = normalize(payload.email || profile?.email || payload.loginEmail);

    if (!result.email && emailRegex.test(email)) {
      result.email = email;
    }

    let changed = false;

    if (!result.userId) {
      result.userId = normalize(auth?.chatgpt_user_id);
      changed = Boolean(result.userId) || changed;
    }

    if (!result.accountId) {
      result.accountId = normalize(auth?.account_id);
      changed = Boolean(result.accountId) || changed;
    }

    if (!result.organizationId) {
      result.organizationId = normalize(auth?.organization_id);
      changed = Boolean(result.organizationId) || changed;
    }

    const previousPlanType = result.planType;
    setPlan(auth?.chatgpt_plan_type);
    changed = result.planType !== previousPlanType || changed;

    const jwtExpiry = normalizeExpiryDate(auth?.chatgpt_subscription_active_until);

    if (jwtExpiry) {
      // ChatGPT subscription_active_until is the account validity signal.
      // Session/account dates can be billing or renewal cycle dates and are lower priority.
      result.subscriptionExpiresAt = jwtExpiry;
      changed = true;
    } else if (!result.subscriptionExpiresAt) {
      result.subscriptionExpiresAt = normalizeExpiryDate(
        auth?.chatgpt_subscription_active_until
      );
    }

    if (changed) {
      appendSource("jwt");
    }
  };
  const applyAuthoritativeExpiryCandidate = (value: unknown): boolean => {
    const expiry = normalizeExpiryDate(value);

    if (!expiry) {
      return false;
    }

    result.subscriptionExpiresAt = expiry;
    return true;
  };
  const collectJwtTokens = (
    value: unknown,
    depth = 0,
    tokens: string[] = []
  ): string[] => {
    if (!value || depth > 5) {
      return tokens;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectJwtTokens(item, depth + 1, tokens);
      }
      return tokens;
    }

    if (typeof value !== "object") {
      return tokens;
    }

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        /^(id_token|idToken|access_token|accessToken)$/i.test(key) &&
        typeof item === "string" &&
        item.split(".").length >= 2
      ) {
        tokens.push(item);
        continue;
      }

      collectJwtTokens(item, depth + 1, tokens);
    }

    return tokens;
  };
  const isPlanText = (value: unknown): boolean => getPlanKey(value) !== "unknown";
  const isDisplayCandidate = (value: unknown): boolean => {
    const text = normalize(value);

    if (!text || text.length > 80) {
      return false;
    }

    if (emailRegex.test(text) || isPlanText(text)) {
      return false;
    }

    return !ignoredTexts.has(text.toLowerCase());
  };
  const isWorkspaceCandidate = (value: unknown): boolean => {
    const text = normalize(value);

    if (!isDisplayCandidate(text)) {
      return false;
    }

    if (/account$/i.test(text) || /^\d+\s+members?$/i.test(text)) {
      return false;
    }

    return text.toLowerCase() !== result.displayName.toLowerCase();
  };
  const applyUserPayload = (user: Record<string, unknown> = {}): void => {
    const email = normalize(user.email || user.loginEmail);
    const userId = normalize(user.id || user.userId || user.sub);
    const displayName = normalize(
      user.name || user.displayName || user.fullName || user.username
    );

    if (!result.email && emailRegex.test(email)) {
      result.email = email;
    }

    if (!result.userId && userId) {
      result.userId = userId;
    }

    if (!result.displayName && isDisplayCandidate(displayName)) {
      result.displayName = displayName;
    }
  };
  const applyAccountPayload = (account: Record<string, unknown> = {}): void => {
    const accountId = normalize(account.id || account.accountId || account.workspaceId);
    const organization = account.organization as Record<string, unknown> | undefined;
    const subscription = account.subscription as Record<string, unknown> | undefined;
    const organizationId = normalize(
      account.organizationId || account.orgId || organization?.id
    );
    const workspaceName = normalize(
      account.workspaceName ||
        account.name ||
        account.accountName ||
        account.slug ||
        organization?.name ||
        organization?.title
    );
    const planValue = normalize(
      account.planType ||
        account.plan ||
        account.subscriptionPlan ||
        subscription?.plan ||
        subscription?.planType
    );

    if (!result.accountId && accountId) {
      result.accountId = accountId;
    }

    if (!result.organizationId && organizationId) {
      result.organizationId = organizationId;
    }

    if (!result.workspaceName && isWorkspaceCandidate(workspaceName)) {
      result.workspaceName = workspaceName;
    }

    setPlan(planValue);
    applyExpiryCandidate(
      account.subscriptionExpiresAt ||
        account.expiresAt ||
        account.currentPeriodEnd ||
        subscription?.expiresAt ||
        subscription?.currentPeriodEnd ||
        subscription?.renewalDate
    );
  };
  const applyExpiryCandidate = (value: unknown): void => {
    if (result.subscriptionExpiresAt) {
      return;
    }

    result.subscriptionExpiresAt = normalizeExpiryDate(value);
  };
  const applySubscriptionPayload = (payload: unknown): void => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }

    const record = payload as Record<string, unknown>;
    const previousPlanType = result.planType;
    let changed = false;

    setPlan(
      record.plan_type ||
        record.planType ||
        record.subscription_plan ||
        record.subscriptionPlan
    );
    changed = result.planType !== previousPlanType || changed;

    changed =
      applyAuthoritativeExpiryCandidate(
        record.active_until ||
          record.activeUntil ||
          record.expires_at ||
          record.expiresAt ||
          record.current_period_end ||
          record.currentPeriodEnd
      ) || changed;

    if (changed) {
      appendSource("subscription");
    }
  };
  const applyAccountSettingsPayload = (payload: unknown): void => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }

    const record = payload as Record<string, unknown>;
    const workspaceName = readRecordString(record, [
      "public_display_name",
      "publicDisplayName",
      "workspace_name",
      "workspaceName",
      "display_name",
      "displayName",
      "name",
      "title"
    ]);
    let changed = false;

    if (!result.workspaceName && isWorkspaceCandidate(workspaceName)) {
      result.workspaceName = workspaceName;
      changed = true;
    }

    if (changed) {
      appendSource("settings");
    }
  };
  const readRecordString = (
    record: Record<string, unknown>,
    keys: string[]
  ): string => {
    for (const key of keys) {
      const value = normalize(record[key]);

      if (value) {
        return value;
      }
    }

    return "";
  };
  const collectWhamRecords = (payload: unknown): Array<Record<string, unknown>> => {
    const records: Array<Record<string, unknown>> = [];
    const pushRecord = (value: unknown): void => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        records.push(value as Record<string, unknown>);
      }
    };
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const accounts = payloadRecord?.accounts;

    if (Array.isArray(accounts)) {
      accounts.forEach(pushRecord);
    } else if (accounts && typeof accounts === "object") {
      Object.values(accounts).forEach(pushRecord);
    } else if (Array.isArray(payload)) {
      payload.forEach(pushRecord);
    }

    return records;
  };
  const applyWhamPayload = (payload: unknown): void => {
    const records = collectWhamRecords(payload);

    if (records.length === 0) {
      return;
    }

    const expectedAccountId = normalize(result.accountId);
    const expectedOrganizationId = normalize(result.organizationId);
    const ordering = (payload as Record<string, unknown>)?.account_ordering;
    const firstOrderingId = Array.isArray(ordering) ? normalize(ordering[0]) : "";
    const selected =
      records.find((record) => {
        const id = readRecordString(record, [
          "id",
          "account_id",
          "accountId",
          "chatgpt_account_id",
          "chatgptAccountId",
          "workspace_id",
          "workspaceId"
        ]);
        return Boolean(expectedAccountId && id === expectedAccountId);
      }) ??
      records.find((record) => {
        const id = readRecordString(record, [
          "id",
          "account_id",
          "accountId",
          "chatgpt_account_id",
          "chatgptAccountId",
          "workspace_id",
          "workspaceId"
        ]);
        return Boolean(firstOrderingId && id === firstOrderingId);
      }) ??
      records.find((record) => {
        const id = readRecordString(record, [
          "organization_id",
          "organizationId",
          "org_id",
          "orgId",
          "workspace_id",
          "workspaceId"
        ]);
        return Boolean(expectedOrganizationId && id === expectedOrganizationId);
      }) ??
      records[0];

    if (!selected) {
      return;
    }

    const workspaceName = readRecordString(selected, [
      "name",
      "display_name",
      "displayName",
      "account_name",
      "accountName",
      "organization_name",
      "organizationName",
      "workspace_name",
      "workspaceName",
      "title"
    ]);
    const accountId = readRecordString(selected, [
      "id",
      "account_id",
      "accountId",
      "chatgpt_account_id",
      "chatgptAccountId",
      "workspace_id",
      "workspaceId"
    ]);
    const organizationId = readRecordString(selected, [
      "organization_id",
      "organizationId",
      "org_id",
      "orgId"
    ]);
    const structure = readRecordString(selected, [
      "structure",
      "account_structure",
      "accountStructure",
      "kind",
      "type",
      "account_type",
      "accountType"
    ]);
    let changed = false;

    if (!result.workspaceName && isWorkspaceCandidate(workspaceName)) {
      result.workspaceName = workspaceName;
      changed = true;
    }

    if (!result.accountId && accountId) {
      result.accountId = accountId;
      changed = true;
    }

    if (!result.organizationId && organizationId) {
      result.organizationId = organizationId;
      changed = true;
    }

    if (result.planType === "unknown" && /team|workspace|business|enterprise|org/i.test(structure)) {
      result.planType = "team";
      result.planLabel = "TEAM";
      changed = true;
    }

    if (changed) {
      appendSource("wham");
    }
  };
  const createAuthorizedHeaders = (): Headers => {
    const headers = new Headers({ accept: "application/json" });
    const accountId = normalize(result.accountId);

    if (accountId) {
      headers.set("ChatGPT-Account-ID", accountId);
    }

    if (sessionAccessToken) {
      headers.set("Authorization", `Bearer ${sessionAccessToken}`);
    }

    return headers;
  };
  const fetchAuthorizedJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url, {
      credentials: "include",
      headers: createAuthorizedHeaders()
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  };
  const fetchAuthorizedAccountDetails = async (): Promise<void> => {
    const accountId = normalize(result.accountId);

    if (!accountId || !sessionAccessToken) {
      return;
    }

    try {
      const [subscription, settings] = await Promise.all([
        fetchAuthorizedJson(
          `/backend-api/subscriptions?account_id=${encodeURIComponent(accountId)}`
        ),
        fetchAuthorizedJson(
          `/backend-api/accounts/${encodeURIComponent(accountId)}/settings`
        )
      ]);

      applySubscriptionPayload(subscription);
      applyAccountSettingsPayload(settings);
    } catch {
      // Authorized account lookups are best effort and must never block saving.
    }
  };
  const fetchWhamAccountProfile = async (): Promise<void> => {
    try {
      if (!sessionAccessToken) {
        return;
      }

      const response = await fetch("/backend-api/wham/accounts/check", {
        credentials: "include",
        headers: createAuthorizedHeaders()
      });

      if (!response.ok) {
        return;
      }

      applyWhamPayload(await response.json());
    } catch {
      // Wham profile lookup is best effort and must never block saving.
    }
  };

  try {
    const response = await fetch("/api/auth/session", { credentials: "include" });

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      sessionAccessToken = normalize(
        payload.accessToken || payload.access_token || payload.token
      );
      const accounts = Array.isArray(payload.accounts)
        ? (payload.accounts as Array<Record<string, unknown>>)
        : [];
      const account =
        ((payload.account as Record<string, unknown>) ||
          accounts.find((item) => item.active || item.current || item.isCurrent) ||
          accounts[0] ||
          {}) as Record<string, unknown>;

      applyUserPayload((payload.user as Record<string, unknown>) || {});
      applyAccountPayload(account);
      setPlan(payload.planType || payload.plan);
      setSource("session");
      collectJwtTokens(payload).forEach(applyJwtToken);
      applyExpiryCandidate(
        payload.subscriptionExpiresAt || payload.expiresAt || payload.currentPeriodEnd
      );
    }
  } catch {
    // Ignore session read failures; DOM fallbacks still run.
  }

  const bootstrapEl = document.getElementById("client-bootstrap");

  if (bootstrapEl?.textContent) {
    try {
      const bootstrap = JSON.parse(bootstrapEl.textContent) as Record<string, unknown>;
      const session = (bootstrap.session as Record<string, unknown>) || {};
      const accounts = Array.isArray(session.accounts)
        ? (session.accounts as Array<Record<string, unknown>>)
        : [];
      const account =
        ((session.account as Record<string, unknown>) ||
          accounts.find((item) => item.active || item.current || item.isCurrent) ||
          accounts[0] ||
          {}) as Record<string, unknown>;

      applyUserPayload(
        ((session.user as Record<string, unknown>) ||
          (bootstrap.user as Record<string, unknown>) ||
          {}) as Record<string, unknown>
      );
      applyAccountPayload(account);
      setPlan(session.planType || session.plan);
      setSource("bootstrap");
      collectJwtTokens(bootstrap).forEach(applyJwtToken);
      applyExpiryCandidate(
        session.subscriptionExpiresAt ||
          session.expiresAt ||
          account.subscriptionExpiresAt ||
          account.expiresAt
      );
    } catch {
      // Ignore malformed bootstrap data.
    }
  }

  await fetchAuthorizedAccountDetails();
  await fetchWhamAccountProfile();

  const bodyText = normalize(document.body?.innerText || document.body?.textContent || "");
  setEmailFromText(bodyText);

  const profileButtons = Array.from(
    document.querySelectorAll<HTMLElement>("[aria-label*='profile' i], [aria-label*='account' i]")
  );

  for (const button of profileButtons) {
    const text = normalize(`${button.getAttribute("aria-label") || ""} ${button.innerText || ""}`);
    setEmailFromText(text);
    setPlan(text);

    if (!result.workspaceName) {
      for (const line of text.split(/\s{2,}|\n+/).map(normalize).filter(Boolean)) {
        if (isWorkspaceCandidate(line)) {
          result.workspaceName = line;
          break;
        }
      }
    }
  }

  if (result.planType === "unknown") {
    setPlan(bodyText);
  }

  if (!result.displayName) {
    const headingText = normalize(document.querySelector("h1")?.textContent);
    const match = headingText.match(/How can I help,\s*(.+?)\?/i);
    const candidate = match?.[1] || "";

    if (isDisplayCandidate(candidate)) {
      result.displayName = candidate;
    }
  }

  if (!result.workspaceName && /workspace data/i.test(bodyText)) {
    const match = bodyText.match(/doesn't use\s+(.+?)\s+workspace data/i);

    if (match?.[1] && isWorkspaceCandidate(match[1])) {
      result.workspaceName = normalize(match[1]);
    }
  }

  const expiryPatterns = [
    /(?:valid until|expires? on|renews? on|next billing date)\s*[:：]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:有效期|到期|续费|下次扣款)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/i,
    /(\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
  ];

  for (const pattern of expiryPatterns) {
    const match = bodyText.match(pattern);

    if (match?.[1]) {
      applyExpiryCandidate(match[1].replace(/[年月]/g, "-").replace("日", ""));
      break;
    }
  }

  if (result.workspaceName && result.planType === "unknown") {
    result.planType = "team";
    result.planLabel = "TEAM";
  }

  if (result.metadataSource === "fallback" && (result.email || result.planType !== "unknown")) {
    result.metadataSource = "dom";
  }

  return result;
}
