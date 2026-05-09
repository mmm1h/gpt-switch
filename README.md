# GPT Account Switcher

<p align="center">
  <img src="public/icons/icon-128.png" alt="GPT Account Switcher" width="96">
</p>

<p align="center">
  <strong>ChatGPT 多账号一键切换</strong><br>
  本地加密 · 零密码存储 · 隐私优先
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

## 亮点功能

| 功能 | 说明 |
|------|------|
| **一键切换** | 弹窗或页面浮动按钮，点击即切换 |
| **本地加密** | 自动密钥加密 cookie，无需记忆口令 |
| **智能识别** | 自动检测邮箱、套餐、Team/Personal、订阅有效期 |
| **防重复保存** | 已保存账号自动识别，避免误操作 |
| **工作区保护** | 工作区到期或不可用时，智能提示切回个人账号 |
| **导入/导出** | 加密 vault 可备份迁移 |

## 隐私边界

- 不保存密码，不存储凭据
- 不绕过 2FA、验证码或风控
- 不调用 ChatGPT 私有接口
- 不做云同步，数据始终在本机
- cookie 加密存储，元数据（邮箱、套餐等）明文保存

## 安装

### 从 Release 安装

1. 从 [Releases](https://github.com/mmm1h/gpt-switch/releases) 下载最新 `.zip`
2. 解压到任意文件夹
3. 打开 `chrome://extensions/` 或 `edge://extensions/`
4. 开启**开发者模式**
5. 点击**加载已解压的扩展**，选择解压后的文件夹

### 从源码构建

```bash
git clone https://github.com/mmm1h/gpt-switch.git
cd gpt-switch
npm install
npm run build
```

构建产物在 `dist/`，按上述步骤加载即可。

## 使用方法

1. 登录你的 ChatGPT 账号
2. 点击扩展图标打开弹窗
3. 等待账号信息识别完成，可选填标签，点击**保存**
4. 切换到另一个账号，重复保存
5. 之后在弹窗或页面右下角浮动按钮中点击即可切换

## 开发

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

# 连接真实 Chrome 运行 E2E
npm run e2e:chrome
```

### 发布

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 会自动构建并创建 Release。

## 技术栈

- **TypeScript** + **Vite** 构建
- **Chrome MV3** 扩展 API
- **Web Crypto API** 本地加密
- **Playwright** E2E 测试

## License

MIT
