# GPT Account Switcher

<p align="center">
  <img src="public/icons/icon-128.png" alt="GPT Account Switcher" width="96">
</p>

<p align="center">
  <strong>ChatGPT 多账号一键切换</strong><br>
  本地加密 · 零密码存储 · 隐私优先
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Edge-Extension-0078D7?logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/MV3-Ready-green" alt="MV3">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/github/v/release/mmm1h/gpt-switch?label=Version" alt="Version">
</p>

---

多个 ChatGPT 账号反复登出登录太烦？这个扩展会把你的登录会话加密保存在本地，切换账号只需点一下——不用输密码，不用过验证码。

## ✨ 亮点功能

| 功能 | 说明 |
|------|------|
| **一键切换** | 弹窗或页面浮动按钮，点击即切换 |
| **本地加密** | 自动密钥加密 cookie，无需记忆口令 |
| **智能识别** | 自动检测邮箱、套餐、Team/Personal 状态及订阅有效期 |
| **会话验证** | 切换时自动验证目标会话是否有效，失效则安全回滚 |
| **过期预警** | 保存的 cookie 在 7 天内即将过期时，提供显眼提示 |
| **工作区保护** | 工作区到期或不可用时，智能提示切回个人账号 |
| **导入/导出** | 加密 vault 库可轻松备份与迁移 |

## 🛡️ 隐私边界

- **不保存密码：** 绝对不存储任何密码或凭据
- **不绕过风控：** 不绕过 2FA、验证码或系统风控
- **不调私有接口：** 不调用 ChatGPT 私有或未公开 API
- **无云端同步：** 数据始终且仅存在于你的本机设备
- **数据处理：** cookie 加密存储，元数据（邮箱、套餐等）明文保存

## 📦 安装

### 从 Release 安装

1. 从 [Releases](https://github.com/mmm1h/gpt-switch/releases) 下载最新的 `.zip` 文件。
2. 将其解压到任意文件夹。
3. 在浏览器打开 `chrome://extensions/` 或 `edge://extensions/`。
4. 开启右上角的**开发者模式**。
5. 点击**加载已解压的扩展程序**，选择刚才解压的文件夹。

### 从源码构建

```bash
git clone https://github.com/mmm1h/gpt-switch.git
cd gpt-switch
npm install
npm run build
```

构建产物会生成在 `dist/` 目录，按上述步骤作为解压扩展加载即可。

## 🚀 使用方法

1. 登录你的 ChatGPT 账号。
2. 点击扩展图标打开弹窗。
3. 等待账号信息识别完成，可选填标签，然后点击**保存当前账号**。
4. 退出并登录另一个账号，重复保存过程。
5. 之后你就可以在弹窗或页面右下角的浮动按钮中随时一键切换了。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 单元测试
npm test

# 端到端测试
npm run e2e

# 构建
npm run build

# 打包发布 ZIP
npm run package:zip
```

### 调试模式

```bash
# 启动带远程调试的 Chrome
npm run chrome:debug

# 连接真实 Chrome 运行 E2E 测试
npm run e2e:chrome
```

### 发布流程

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 会自动构建并创建 Release。

## 🥞 技术栈

- **TypeScript** + **Vite** 构建
- **Chrome MV3** 扩展 API
- **Web Crypto API** 本地加密
- **Playwright** E2E 测试

## 📄 License

MIT