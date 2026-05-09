# GPT Account Switcher

<p align="center">
  <img src="public/icons/icon-128.png" alt="GPT Account Switcher" width="96">
</p>

<p align="center">
  <strong>One-Click Multiple ChatGPT Account Switcher</strong><br>
  Local Encryption · Zero Password Storage · Privacy First
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

Tired of repeatedly logging in and out of multiple ChatGPT accounts? This extension securely encrypts and stores your login sessions locally. Switch between accounts with a single click—no passwords, no CAPTCHAs.

## ✨ Features

| Feature | Description |
|------|------|
| **One-Click Switch** | Switch instantly via the popup menu or on-page floating button. |
| **Local Encryption** | Auto-generated keys encrypt cookies, requiring no master password. |
| **Smart Detection** | Automatically detects email, plan, Team/Personal workspace, and subscription validity. |
| **Session Validation** | Verifies session authenticity upon switching, automatically rolling back if the target session has expired. |
| **Expiry Warnings** | Proactively warns you when a saved cookie is within 7 days of expiration. |
| **Workspace Protection**| Prompts to switch back to a personal account when a workspace expires or becomes unavailable. |
| **Import / Export** | Backup and migrate your encrypted vault effortlessly. |

## 🛡️ Privacy Boundaries

- **No Passwords:** We do not save or store passwords/credentials.
- **No Bypassing:** We do not bypass 2FA, CAPTCHAs, or risk control mechanisms.
- **No Private APIs:** We do not invoke internal or private ChatGPT APIs.
- **No Cloud Sync:** Data is never sent to the cloud; it remains strictly on your local machine.
- **Data Handling:** Cookies are stored encrypted. Non-sensitive metadata (email, plan type, etc.) is stored in plaintext.

## 📦 Installation

### From Release

1. Download the latest `.zip` file from [Releases](https://github.com/mmm1h/gpt-switch/releases).
2. Extract the archive to a folder of your choice.
3. Navigate to `chrome://extensions/` or `edge://extensions/` in your browser.
4. Enable **Developer mode** in the top right corner.
5. Click **Load unpacked** and select the extracted folder.

### Build from Source

```bash
git clone https://github.com/mmm1h/gpt-switch.git
cd gpt-switch
npm install
npm run build
```

The output will be in the `dist/` directory. Load it as an unpacked extension following the steps above.

## 🚀 Usage

1. Log in to your ChatGPT account.
2. Click the extension icon to open the popup.
3. Wait for the account information to be detected. You can optionally add a label, then click **Save**.
4. Log in to another account and repeat the saving process.
5. You can now seamlessly switch between accounts via the popup or the floating button on the ChatGPT page.

## 🛠️ Development

```bash
# Install dependencies
npm install

# Unit tests
npm test

# End-to-End tests
npm run e2e

# Build the extension
npm run build

# Package into ZIP for release
npm run package:zip
```

### Debugging

```bash
# Start Chrome with remote debugging enabled
npm run chrome:debug

# Run E2E tests against the real Chrome instance
npm run e2e:chrome
```

### Release Process

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions will automatically build the project and create a new Release.

## 🥞 Tech Stack

- **TypeScript** + **Vite**
- **Chrome Extension MV3** API
- **Web Crypto API** for local encryption
- **Playwright** for E2E testing

## 📄 License

MIT
