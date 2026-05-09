import { chromium, expect, test } from "@playwright/test";

const CDP_ENDPOINT = process.env.GPT_SWITCH_CDP_ENDPOINT ?? "http://127.0.0.1:9222";

test("connects to debug Chrome and verifies the in-page switcher", async () => {
  await assertCdpEndpointAvailable();

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);

  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page =
      context.pages().find((item) => item.url().startsWith("https://chatgpt.com")) ??
      (await context.newPage());

    if (!page.url().startsWith("https://chatgpt.com")) {
      await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
    }

    const host = page.locator("#gpt-account-switcher-host");
    await expect(host, "没有检测到页面浮动入口，请确认 debug Chrome 已加载 dist 扩展").toHaveCount(1, {
      timeout: 20_000
    });

    const iconSrc = await host.evaluate((node) => {
      const image = node.shadowRoot?.querySelector<HTMLImageElement>("#fab img");
      return image?.getAttribute("src") ?? "";
    });
    expect(iconSrc).toContain("icons/icon-48.png");

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

    await page.mouse.click(12, 12);
    await expect
      .poll(async () =>
        host.evaluate((node) =>
          node.shadowRoot?.querySelector("#panel")?.classList.contains("open") ?? false
        )
      )
      .toBe(false);
  } finally {
    await browser.close();
  }
});

async function assertCdpEndpointAvailable(): Promise<void> {
  try {
    const response = await fetch(`${CDP_ENDPOINT}/json/version`);

    if (response.ok) {
      return;
    }
  } catch {
    // Handled below with a deterministic setup hint.
  }

  throw new Error(
    [
      `无法连接 ${CDP_ENDPOINT}`,
      "请先运行: npm run build && npm run chrome:debug",
      "然后在打开的 debug Chrome 里登录 ChatGPT，再运行: npm run e2e:chrome"
    ].join("\n")
  );
}
