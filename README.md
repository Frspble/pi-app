# Pi App

Pi App 是基于 [pi-web](https://github.com/agegr/pi-web) fork 的 Pi Coding Agent 桌面客户端。它保留 Web UI 的会话浏览和实时对话体验，并通过 Electron 打包为 macOS / Windows 应用。

Pi Core 不会被打进安装包。桌面端会在用户数据目录中维护独立 runtime，并通过本机 `npm` 安装和更新兼容版本的 Pi Core。

## 主要功能

- **桌面客户端**：Electron 外壳运行现有 Next.js UI，支持 macOS 和 Windows。
- **Pi Core 独立运行时**：Pi Core 安装在 `PiApp/runtime`，不污染项目目录，也不打进安装包。
- **会话浏览器**：按工作目录分组展示 Pi 会话，支持重命名、删除、分叉和分支切换。
- **实时对话**：通过 SSE 流式显示 Agent 输出，支持中断、追加、引导和压缩会话。
- **文件面板**：内置文件浏览和预览，可在右侧面板打开当前工作目录文件。
- **模型与技能配置**：在 UI 中管理模型配置、OAuth/API Key、技能可见性。
- **设置页**：支持主题、语言、Pi Core 状态检查与更新。
- **顶部状态栏**：显示 token、费用、缓存和上下文窗口用量，并提供简洁 tooltip。
- **多语言与主题**：支持中文 / English，支持浅色、深色和跟随系统。

## 桌面运行

下载 GitHub Release 中对应平台的安装包：

- macOS：`.dmg` 或 `.zip`
- Windows：NSIS `.exe` 安装包或 `.zip`

首次启动时，Pi App 会检查本机 `npm`，并在应用数据目录安装兼容的 Pi Core：

- macOS：`~/Library/Application Support/PiApp/runtime`
- Windows：`%APPDATA%/PiApp/runtime`

如果 Pi Core 缺失或需要更新，可以在 `Settings -> Pi Core` 中检查和更新。

## Web/开发运行

这个项目仍保留 pi-web 的浏览器开发方式：

```bash
npm install
npm run dev
```

启动后打开 [http://127.0.0.1:30141](http://127.0.0.1:30141)。

Electron 开发调试：

```bash
npm run dev
npm run desktop:dev:attach
```

## 打包

macOS 本机打包：

```bash
npm run desktop:pack:mac
```

Windows 建议在 Windows 电脑或 GitHub Actions Windows runner 上打包：

```bash
npm run desktop:pack:win
```

推送 `v*` tag 会触发 `.github/workflows/desktop.yml`，自动构建 macOS / Windows 包并发布 GitHub Release。

## CLI 兼容入口

仍可使用原 pi-web CLI 入口运行 Web UI：

```bash
npx @agegr/pi-web@latest
```

或全局安装：

```bash
npm install -g @agegr/pi-web
pi-web
```

可选参数：

```bash
pi-web --port 8080
pi-web --hostname 127.0.0.1
pi-web -p 8080 -H 127.0.0.1

PORT=8080 pi-web
```

## 数据与配置

- **会话目录**：默认读取 `~/.pi/agent/sessions`，可通过 `PI_CODING_AGENT_DIR` 指定。
- **模型配置**：读取 Pi Agent 数据目录下的 `models.json`，可在 Pi App 的 Models 面板中编辑。
- **桌面 runtime**：Pi Core 安装在 App 用户数据目录下的 `PiApp/runtime`。

## 项目结构

```text
app/
  api/
    sessions/      # 读写会话文件
    agent/         # 发送命令、SSE 事件流
    files/         # 文件内容读取
    models/        # 可用模型列表与默认模型
    models-config/ # 读写 models.json
components/        # UI 组件
electron/          # Electron main/preload/Core Service/runtime 管理
hooks/             # 主题、语言、音效、会话状态等 hooks
lib/
  core-proxy.ts      # Next API 到 Core Service 的代理
  session-reader.ts  # 解析 .jsonl 会话文件
  rpc-manager.ts     # 浏览器 dev fallback 的 AgentSession 生命周期
  normalize.ts       # 规范化 toolCall 字段名
  types.ts
```
