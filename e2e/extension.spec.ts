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
    const popup = await harness.context.newPage();
    await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);

    await expect(popup.getByRole("heading", { name: "GPT Switch" })).toBeVisible();
    await expect(popup.getByRole("button", { name: "保存当前账号" })).toBeVisible();
    await expect(popup.getByLabel("Team Name")).toBeVisible();
    await expect(popup.getByLabel("账号有效期")).toBeVisible();

    const chatPage = await harness.context.newPage();
    await chatPage.route("https://chatgpt.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!doctype html>
          <html lang="zh-CN">
            <head><title>Fake ChatGPT</title></head>
            <body><main>Fake ChatGPT page for extension tests</main></body>
          </html>
        `
      });
    });
    await chatPage.goto("https://chatgpt.com/");

    const host = chatPage.locator("#gpt-account-switcher-host");
    await expect(host).toHaveCount(1);

    const fabText = await host.evaluate((node) => {
      const button = node.shadowRoot?.querySelector<HTMLButtonElement>("#fab");
      return button?.textContent ?? "";
    });
    expect(fabText).toBe("GPT");
  } finally {
    await cleanupHarness(harness);
  }
});

test("shows a confirmation dialog when a workspace unavailable page is detected", async () => {
  const harness = await launchExtension();

  try {
    const popup = await harness.context.newPage();
    await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);
    await expect(popup.getByRole("button", { name: "保存当前账号" })).toBeVisible();

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
