# GPT Account Switcher

Chrome / Edge MV3 扩展，用本地加密 vault 保存多个 ChatGPT 登录会话快照，并支持一键切换。

## 能做什么

- 保存当前已登录的 ChatGPT / OpenAI cookie 快照，包括 `HttpOnly` cookie。
- 用扩展本地自动密钥加密保存快照，不需要输入口令，不保存账号密码。
- 在扩展弹窗里切换账号。
- 保存账号时可标记个人 / Team，并记录 Team Name、订阅/付费账号有效期。
- 标记一个“个人默认账号”，当工作区到期、解散或不可访问时，页面会提示是否切回个人账号。
- 支持导出 / 导入加密 vault。

## 不能做什么

- 不保存密码。
- 不绕过 2FA、验证码、风控或访问限制。
- 不调用 ChatGPT 私有接口。
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

当前文件名形如 `release/gpt-account-switcher-v0.1.0.zip`。ZIP 根目录直接包含 `manifest.json`、`background.js`、`popup.html` 等扩展文件。

Chrome/Edge 开发者模式下最稳的本地安装方式仍是：

1. 解压 ZIP 到一个文件夹。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`。
3. 开启开发者模式。
4. 选择“加载已解压的扩展”并选中解压后的文件夹。

说明：Chrome 对“直接拖入 ZIP 安装”的支持并不稳定，未签名扩展通常需要加载解压目录；`.crx` 才更接近拖拽安装。

`npm run e2e` 会先构建扩展，再用 Playwright 启动一个临时 Chromium 用户目录加载 `dist/`。当前自动验收覆盖：

- 扩展能被 Chromium 加载。
- popup 能初始化本地加密 vault。
- popup 能显示 Team Name 和账号有效期字段。
- ChatGPT 页面能注入右下角 `GPT` 浮动入口。
- 工作区不可用页面会显示“切回个人账号”确认弹窗。

如果本机缺 Playwright 浏览器，可先运行：

```powershell
npx playwright install chromium
```

真实账号 A/B 切换仍需要手动登录准备会话，自动测试不会保存密码、绕过 2FA、验证码或风控。

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

## 参考项目取舍

参考过 [kieranchan/GPT-switcher](https://github.com/kieranchan/GPT-switcher)。可借鉴方向：

- 发布形态：用 GitHub Release 分发 ZIP。
- 产品体验：账号列表、标签/筛选、工作区信息、套餐徽章、导入导出。
- 测试思路：用浏览器自动化覆盖 popup 主要交互。

暂不直接采用的部分：

- 它以 `__Secure-next-auth.session-token` 为核心保存账号；本项目保留“完整 cookie 快照 + 加密 vault”，更适合处理 ChatGPT/OpenAI 登录链路变化。
- 它的导出数据偏明文账号 token；本项目导出本地密钥加密后的 vault。
- 它会从页面结构/接口推断 Team workspace 信息；本项目 v1 不依赖 ChatGPT 私有接口，只做工作区不可用检测和个人账号回退。

## 使用流程

1. 手动登录 ChatGPT 账号 A。
2. 打开扩展弹窗。
3. 填写账号标签、个人/Team、Team Name、订阅有效期等信息，点击“保存当前账号”。
4. 手动切换登录账号 B，再保存第二个账号。
5. 之后在扩展弹窗或页面右下角 `GPT` 按钮里点击账号切换。

## 安全边界

扩展需要 `cookies` 权限和 ChatGPT / OpenAI 域名权限，因为核心功能就是读取并恢复这些域名的登录 cookie。cookie value 会进入本地密钥加密 vault；profile 标签、邮箱提示、颜色、Team Name、订阅有效期和时间戳是明文元数据。

取消口令后，使用体验更轻，但本地扩展存储泄漏时不能再依赖用户口令做第二道保护。这个项目默认按个人本机工具处理，不做云同步。

如果 ChatGPT 登录机制变更，旧快照可能会失效。此时需要手动重新登录并刷新保存账号。
