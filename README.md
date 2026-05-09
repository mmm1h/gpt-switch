# GPT Account Switcher

Chrome / Edge MV3 扩展，用本地加密 vault 保存多个 ChatGPT 登录会话快照，并支持一键切换。

## 能做什么

- 保存当前已登录的 ChatGPT / OpenAI cookie 快照，包括 `HttpOnly` cookie。
- 用用户口令本地加密保存快照，不保存账号密码。
- 在扩展弹窗里切换账号。
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
npm run build
```

构建产物在 `dist/`。

## 本地加载

1. 打开 Chrome / Edge 的扩展管理页面。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展”。
4. 选择本项目的 `dist/` 目录。

## 使用流程

1. 手动登录 ChatGPT 账号 A。
2. 打开扩展弹窗，创建或解锁 vault。
3. 点击“保存当前账号”。
4. 手动切换登录账号 B，再保存第二个账号。
5. 之后在扩展弹窗或页面右下角 `GPT` 按钮里点击账号切换。

## 安全边界

扩展需要 `cookies` 权限和 ChatGPT / OpenAI 域名权限，因为核心功能就是读取并恢复这些域名的登录 cookie。cookie value 会进入加密 vault；profile 标签、邮箱提示、颜色和时间戳是明文元数据。

如果 ChatGPT 登录机制变更，旧快照可能会失效。此时需要手动重新登录并刷新保存账号。
