import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

interface ExtensionHarness {
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}

const FIXED_EXTENSION_ID = "ionngapfgimmibmiahmgieegfcocndcn";

test("loads the extension, initializes local vault, and injects the ChatGPT page switcher", async () => {
  const harness = await launchExtension();

  try {
    const subscriptionExpiry = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    const sessionCycleDate = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000);
    const idToken = makeJwt({
      email: "team@example.com",
      "https://api.openai.com/auth": {
        chatgpt_user_id: "user_1",
        chatgpt_plan_type: "team",
        chatgpt_subscription_active_until: subscriptionExpiry.toISOString(),
        account_id: "acct_1",
        organization_id: "org_1"
      }
    });
    const chatPage = await harness.context.newPage();
    await chatPage.route("https://chatgpt.com/**", async (route) => {
      if (route.request().url().endsWith("/api/auth/session")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              id: "user_1",
              email: "team@example.com",
              name: "Team User"
            },
            account: {
              id: "acct_1",
              organizationId: "org_1",
              plan: "team",
              expiresAt: sessionCycleDate.toISOString()
            },
            accessToken: "test-access-token",
            id_token: idToken
          })
        });
        return;
      }

      if (route.request().url().includes("/backend-api/subscriptions?account_id=acct_1")) {
        await route.fulfill({
          status: route.request().headers().authorization ? 200 : 401,
          contentType: "application/json",
          body: JSON.stringify({
            plan_type: "team",
            active_until: subscriptionExpiry.toISOString(),
            billing_period: "monthly",
            will_renew: true
          })
        });
        return;
      }

      if (route.request().url().includes("/backend-api/accounts/acct_1/settings")) {
        await route.fulfill({
          status: route.request().headers().authorization ? 200 : 401,
          contentType: "application/json",
          body: JSON.stringify({
            public_display_name: "helloword1"
          })
        });
        return;
      }

      if (route.request().url().includes("/backend-api/wham/accounts/check")) {
        await route.fulfill({
          status: route.request().headers().authorization ? 200 : 401,
          contentType: "application/json",
          body: JSON.stringify({
            account_ordering: ["acct_1"],
            accounts: [
              {
                id: "acct_1",
                organization_id: "org_1",
                display_name: "helloword1",
                structure: "team"
              }
            ]
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!doctype html>
          <html lang="zh-CN">
            <head><title>Fake ChatGPT</title></head>
            <body>
              <script id="client-bootstrap" type="application/json">
                {"session":{"user":{"id":"user_1","email":"team@example.com","name":"Team User"},"account":{"id":"acct_1","organizationId":"org_1","plan":"team","expiresAt":"${sessionCycleDate.toISOString()}"},"accessToken":"test-access-token","id_token":"${idToken}"}}
              </script>
              <main>Fake ChatGPT page for extension tests</main>
            </body>
          </html>
        `
      });
    });
    await chatPage.goto("https://chatgpt.com/");

    await harness.context.addCookies([
      {
        name: "__Secure-next-auth.session-token",
        value: "fake-token",
        url: "https://chatgpt.com/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 3600
      }
    ]);

    const popup = await harness.context.newPage();
    await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);

    await expect(popup.getByRole("heading", { name: "GPT Switch" })).toBeVisible();
    await expect(popup.getByRole("button", { name: "保存当前账号" })).toBeVisible();
    await expect(popup.locator("#profile-label")).toBeVisible();
    await expect(popup.locator("#profile-email")).toHaveCount(0);
    await expect(popup.locator("#profile-workspace")).toHaveCount(0);
    await expect(popup.locator("#profile-expiry")).toHaveCount(0);
    await expect(popup.getByText("team@example.com")).toBeVisible();
    await expect(popup.getByText("Team Name: helloword1")).toBeVisible();
    await expect(popup.getByText(/^有效期 1[12]天$/)).toBeVisible();
    await expect(popup.getByText("有效期 22天")).toHaveCount(0);

    await popup.locator("#profile-label").fill("公司号");
    await popup.getByRole("button", { name: "保存当前账号" }).click();
    await expect(popup.locator("#message")).toHaveText("当前账号已保存");
    await expect(popup.getByRole("button", { name: "保存当前账号" })).toHaveCount(0);
    await expect(popup.locator(".profile-card").getByText("team@example.com")).toBeVisible();
    await expect(popup.locator(".profile-card .current-tag", { hasText: "当前" })).toBeVisible();
    await expect(popup.locator(".corner-tag", { hasText: "公司号" })).toBeVisible();
    await expect(popup.locator(".profile-card .plan-badge", { hasText: /^TEAM$/ })).toBeVisible();
    await expect(popup.locator(".profile-card").getByText(/^有效期 1[12]天$/)).toBeVisible();

    const host = chatPage.locator("#gpt-account-switcher-host");
    await expect(host).toHaveCount(1);

    const iconSrc = await host.evaluate((node) => {
      const image = node.shadowRoot?.querySelector<HTMLImageElement>("#fab img");
      return image?.getAttribute("src") ?? "";
    });
    expect(iconSrc).toContain("icons/icon-48.png");

    const closedFabLeft = await host.evaluate((node) => {
      const button = node.shadowRoot?.querySelector<HTMLButtonElement>("#fab");
      return Math.round(button?.getBoundingClientRect().left ?? 0);
    });

    await host.evaluate((node) => {
      node.shadowRoot?.querySelector<HTMLButtonElement>("#fab")?.click();
    });
    await expect
      .poll(async () =>
        host.evaluate((node) =>
          node.shadowRoot?.querySelector("#panel")?.classList.contains("open") ?? false
        )
      )
      .toBe(true);
    await expect
      .poll(async () =>
        host.evaluate((node) => {
          const button = node.shadowRoot?.querySelector<HTMLButtonElement>("#fab");
          return Math.round(button?.getBoundingClientRect().left ?? 0);
        })
      )
      .toBe(closedFabLeft);
    await expect
      .poll(async () =>
        host.evaluate((node) =>
          node.shadowRoot?.querySelector("#panel")?.textContent?.includes("helloword1") ?? false
        )
      )
      .toBe(true);

    await chatPage.mouse.click(10, 10);
    await expect
      .poll(async () =>
        host.evaluate((node) =>
          node.shadowRoot?.querySelector("#panel")?.classList.contains("open") ?? false
        )
      )
      .toBe(false);
  } finally {
    await cleanupHarness(harness);
  }
});

test("shows a confirmation dialog when a workspace unavailable page is detected", async () => {
  const harness = await launchExtension();

  try {
    const popup = await harness.context.newPage();
    await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);
    await expect(popup.getByText("没有读到 ChatGPT 登录 cookie")).toBeVisible();
    await expect(popup.getByRole("button", { name: "保存当前账号" })).toHaveCount(0);

    const chatPage = await harness.context.newPage();
    await chatPage.route("https://chatgpt.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!doctype html>
          <html lang="en">
            <head><title>Workspace unavailable</title></head>
            <body>
              <h1>This workspace is no longer available</h1>
              <p>The organization may have been deleted or expired.</p>
            </body>
          </html>
        `
      });
    });
    await chatPage.goto("https://chatgpt.com/c/workspace-expired");

    await expect(chatPage.getByText("当前工作区不可用")).toBeVisible();
    await expect(chatPage.getByRole("button", { name: "切回个人账号" })).toBeVisible();
  } finally {
    await cleanupHarness(harness);
  }
});

async function launchExtension(): Promise<ExtensionHarness> {
  const extensionPath = path.resolve(process.cwd(), "dist");
  const userDataDir = await mkdtemp(path.join(tmpdir(), "gpt-switch-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  return {
    context,
    extensionId: FIXED_EXTENSION_ID,
    userDataDir
  };
}

async function cleanupHarness(harness: ExtensionHarness): Promise<void> {
  await harness.context.close();
  await rm(harness.userDataDir, { recursive: true, force: true });
}

function makeJwt(payload: unknown): string {
  return [
    encodeBase64Url({ alg: "none", typ: "JWT" }),
    encodeBase64Url(payload),
    "sig"
  ].join(".");
}

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
