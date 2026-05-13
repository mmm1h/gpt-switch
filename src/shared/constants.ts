export const STORAGE_KEY = "gptAccountSwitcherState";

export const CURRENT_ACCOUNT_STATUS_CACHE_KEY = "gptAccountSwitcherCurrentAccountStatus";

export const CHATGPT_HOME_URL = "https://chatgpt.com/";

export const COOKIE_DOMAIN_SUFFIXES = ["chatgpt.com", "openai.com"];

export const OPENAI_WORKSPACE_HOST_SUFFIXES = ["chatgpt.com", "openai.com"];

export const OPENAI_WORKSPACE_MATCH_PATTERNS = [
  "https://chatgpt.com/*",
  "https://*.chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://*.openai.com/*",
  "https://openai.com/*"
];

export const CHATGPT_TAB_PATTERNS = OPENAI_WORKSPACE_MATCH_PATTERNS;

export function isOpenAiWorkspaceUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      OPENAI_WORKSPACE_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
      )
    );
  } catch {
    return false;
  }
}

export const VAULT_MAGIC = "gpt-account-switcher-vault-v1";

export const KDF_ITERATIONS = 250_000;
