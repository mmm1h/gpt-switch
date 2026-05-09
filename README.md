# GPT Account Switcher

Chrome / Edge MV3 扩展，用本地加密 vault 保存多个 ChatGPT 登录会话快照，并支持一键切换。

## 能做什么

- 保存当前已登录的 ChatGPT / OpenAI cookie 快照，包括 `HttpOnly` cookie。
- 用扩展本地自动密钥加密保存快照，不需要输入口令，不保存账号密码。
- 在扩展弹窗里切换账号。
- 保存账号时自动检测邮箱、套餐、Team Name 和可解析的订阅有效期；账号标签可填可不填。
- 当前账号已经保存过时，弹窗只显示“当前账号已保存”，不再提示重复保存。
- 当工作区到期、解散或不可访问时，页面会提示是否切回已保存的个人账号。
- 支持导出 / 导入加密 vault。

## 不能做什么

- 不保存密码。
- 不绕过 2FA、验证码、风控或访问限制。
- 不调用 ChatGPT 私有接口做账号操作；账号检测只做只读、尽力而为的轻量读取。
- 不做云同步。

## 开发

```powershell
npm install
npm test
npm run e2e
npm run build
npm run package:zip
```

构建产物在 `dist/`。

发布 ZIP 会生成到 `release/`：

```powershell
npm run build
npm run package:zip
```

当前文件名形如 `release/gpt-account-switcher-v0.1.4.zip`。ZIP 根目录直接包含 `manifest.json`、`background.js`、`popup.html` 等扩展文件。

Chrome/Edge 开发者模式下最稳的本地安装方式仍是：

1. 解压 ZIP 到一个文件夹。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展”并选中解压后的文件夹。

说明：Chrome 对“直接拖入 ZIP 安装”的支持并不稳定，未签名扩展通常需要加载解压目录；`.crx` 才更接近拖拽安装。

本项目在 `manifest.json` 里固定了开发用 public key，因此本地开发加载的扩展 ID 固定为：

```text
ionngapfgimmibmiahmgieegfcocndcn
```

如果你之前安装过没有固定 ID 的旧版本，Chrome 会把新版本当成另一个扩展。处理方式是先在 `chrome://extensions/` 删除旧的重复项，只保留这个固定 ID 的版本；之后新构建不会再变成第二个扩展。

`npm run e2e` 会先构建扩展，再用 Playwright 启动一个临时 Chromium 用户目录加载 `dist/`。当前自动验收覆盖：

- 扩展能被 Chromium 加载。
- popup 能初始化本地加密 vault。
- popup 能自动显示当前账号检测预览；账号已保存时隐藏保存入口。
- 保存账号时只需要可选标签，账号卡片顶部显示邮箱、套餐、Team/Personal 和有效期状态。
- ChatGPT 页面能注入右下角扩展 icon 浮动入口。
- 页面浮动入口使用扩展 icon，面板支持点击页面空白区域关闭。
- 工作区不可用页面会显示“切回个人账号”确认弹窗。

如果本机缺 Playwright 浏览器，可先运行：

```powershell
npx playwright install chromium
```

真实账号 A/B 切换仍需要手动登录准备会话，自动测试不会保存密码、绕过 2FA、验证码或风控。

### 连接真实 Chrome 排查

普通已打开的 Chrome 如果没有 `--remote-debugging-port`，Playwright 不能直接接管。推荐用独立调试 profile：

```powershell
npm run build
npm run chrome:debug
```

在打开的 debug Chrome 里登录 ChatGPT 后运行：

```powershell
npm run e2e:chrome
```

这个路径会连接 `http://127.0.0.1:9222`，用于快速检查真实页面里的浮动入口、面板开合和当前扩展加载状态。主流程 CI 仍使用隔离的 `npm run e2e`。

## 本地加载

1. 打开 Chrome / Edge 的扩展管理页面。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展”。
4. 选择本项目的 `dist/` 目录。

## GitHub 自动构建

`.github/workflows/build.yml` 会在 `main` push、PR、手动触发和 `v*` tag 时运行：

- `npm ci`
- `npm test`
- `npm run build`
- `npm run package:zip`
- 上传 `release/*.zip` 作为 workflow artifact
- 如果触发来源是 `v*` tag，则自动创建/更新 GitHub Release 并上传 ZIP

创建正式发布示例：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Actions 完成后，GitHub Release 里会带可下载 ZIP。

## 使用流程

1. 手动登录 ChatGPT 账号 A。
2. 打开扩展弹窗。
3. 等待账号预览完成；如果当前账号还没保存，账号标签可填可空，点击“保存当前账号”。
4. 手动切换登录账号 B，再保存第二个账号。
5. 之后在扩展弹窗或页面右下角浮动按钮里点击账号切换。

## 自动保存策略

技术上扩展可以在检测到新账号后自动保存 cookie 快照，但 v1 采用提示式保存：只有未保存账号才展示保存入口，仍由用户主动点击。这样能避免误保存临时账号、测试账号或别人短暂登录的账号，隐私边界更稳一点。

## 安全边界

扩展需要 `cookies` 权限和 ChatGPT / OpenAI 域名权限，因为核心功能就是读取并恢复这些域名的登录 cookie。cookie value 会进入本地密钥加密 vault；账号邮箱、标签、颜色、Team Name、订阅有效期和时间戳是明文元数据。

取消口令后，使用体验更轻，但本地扩展存储泄漏时不能再依赖用户口令做第二道保护。账号邮箱、套餐、Team Name 和有效期属于明文元数据；cookie value 仍保存在本地密钥加密 vault 中。这个项目默认按个人本机工具处理，不做云同步。

如果 ChatGPT 登录机制变更，旧快照可能会失效。此时需要手动重新登录并刷新保存账号。
