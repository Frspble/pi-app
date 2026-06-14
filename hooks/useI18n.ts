"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type LanguageMode = "system" | "en" | "zh";
export type ResolvedLanguage = "en" | "zh";

type LanguageSnapshot = `${LanguageMode}:${ResolvedLanguage}`;
type Primitive = string | number | boolean | null | undefined;

const LANGUAGE_MODE_KEY = "pi-language-mode";
const MODES: LanguageMode[] = ["system", "en", "zh"];
const listeners = new Set<() => void>();

let initialized = false;
let desktopModeLoaded = false;

export const translations = {
  en: {
    "common.appName": "Pi App",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.delete": "Delete",
    "common.error": "Error",
    "common.loading": "Loading...",
    "common.open": "Open",
    "common.refresh": "Refresh",
    "common.retry": "Retry",
    "common.quit": "Quit",
    "common.settings": "Settings",
    "common.models": "Models",
    "common.skills": "Skills",
    "common.update": "Update",
    "common.install": "Install",
    "common.installed": "Installed",
    "common.save": "Save",
    "common.saved": "Saved",
    "common.saving": "Saving...",
    "common.raw": "Raw",
    "common.preview": "Preview",
    "common.download": "Download",
    "common.noChanges": "No changes",
    "common.copy": "Copy",
    "common.copied": "Copied",
    "language.system": "Follow System",
    "language.english": "English",
    "language.chinese": "中文",
    "language.section": "Language",
    "language.headerHelp": "Choose the language used by Pi App.",
    "language.title": "Language",
    "language.status": "Using {language} from {source}.",
    "language.option.system.description": "Use the current macOS, Windows, or browser language.",
    "language.option.en.description": "Use English for the app interface.",
    "language.option.zh.description": "使用中文作为应用界面语言。",
    "language.preview": "Preview",
    "language.preview.surface": "Interface text",
    "language.preview.action": "Primary action",
    "settings.appearance": "Appearance",
    "settings.appearanceHelp": "Choose how Pi App follows light and dark mode.",
    "settings.piCoreHelp": "Manage the app-owned local runtime used by Pi App.",
    "settings.theme": "Theme",
    "settings.themeStatus": "Using {theme} from {source}.",
    "settings.theme.system": "Follow System",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.theme.resolvedLight": "Light",
    "settings.theme.resolvedDark": "Dark",
    "settings.theme.sourceSystem": "system",
    "settings.theme.option.system.description": "Use the current macOS or Windows appearance.",
    "settings.theme.option.light.description": "Use the bright workspace palette.",
    "settings.theme.option.dark.description": "Use the low-light workspace palette.",
    "settings.preview": "Preview",
    "settings.preview.workspace": "Workspace surface",
    "settings.preview.action": "Primary action",
    "core.status.missing": "Not installed",
    "core.status.upToDate": "Up to date",
    "core.status.updateAvailable": "Update available",
    "core.status.unknown": "Unknown",
    "core.unavailable": "Desktop runtime unavailable. Pi Core settings are available inside the packaged Pi App.",
    "core.loadFailed": "Failed to load Pi Core status.",
    "core.checkingMessage": "Checking npm for the latest compatible Pi Core versions...",
    "core.updatesAvailable": "Compatible Pi Core updates are available.",
    "core.alreadyLatest": "Pi Core is already on the latest compatible versions.",
    "core.checkFailed": "Failed to check Pi Core updates.",
    "core.updatingMessage": "Updating Pi Core and restarting the local service...",
    "core.updatedMessage": "Pi Core updated. The local service has restarted.",
    "core.updateFailed": "Failed to update Pi Core.",
    "core.runtime": "Runtime",
    "core.runtimeHelp": "Pi Core is installed outside the packaged app.",
    "core.openRuntime": "Open Runtime",
    "core.openLog": "Open Log",
    "core.runtimePath": "Runtime path",
    "core.nodeModules": "Node modules",
    "core.logFile": "Log file",
    "core.packages": "Packages",
    "core.packagesHelp": "Updates stay within the compatible range declared by this app.",
    "core.checkUpdates": "Check Updates",
    "core.checking": "Checking...",
    "core.updateCore": "Update Pi Core",
    "core.updating": "Updating...",
    "core.table.package": "Package",
    "core.table.range": "Range",
    "core.table.installed": "Installed",
    "core.table.latest": "Latest",
    "core.table.status": "Status",
    "core.loadingStatus": "Loading Pi Core status...",
    "startup.coreFailed": "Pi Core setup failed",
    "startup.preparingCore": "Preparing Pi Core",
    "startup.starting": "Starting Pi App...",
    "startup.runtimeUnavailable": "Desktop runtime unavailable",
    "startup.opening": "Pi App is opening...",
    "app.hideSidebar": "Hide sidebar",
    "app.showSidebar": "Show sidebar",
    "app.exportHtml": "Export HTML",
    "app.exportUnavailable": "Export is available after the session is saved",
    "app.export": "Export",
    "app.system": "System",
    "app.systemPromptEmpty": "System prompt is empty (tools are disabled)",
    "app.systemPromptLoad": "System prompt has not loaded yet.",
    "app.systemPromptLoading": "Loading system prompt...",
    "app.systemPromptError": "Failed to load system prompt: {error}",
    "app.systemPromptNoSession": "System prompt is available after a session is saved.",
    "app.systemPromptUnavailable": "System prompt is unavailable.",
    "app.systemPromptTooltip": "System prompt",
    "app.stats.unknown": "unknown",
    "app.stats.inputTooltip": "Input {count}",
    "app.stats.inputPendingTooltip": "Input --",
    "app.stats.outputTooltip": "Output {count}",
    "app.stats.outputPendingTooltip": "Output --",
    "app.stats.cacheReadTooltip": "Cache {count}",
    "app.stats.cacheReadPendingTooltip": "Cache --",
    "app.stats.costTooltip": "Cost {cost}",
    "app.stats.costPendingTooltip": "Cost --",
    "app.stats.contextTooltip": "Context {percent} · {used}/{window}",
    "app.stats.contextPendingTooltip": "Context --/{window}",
    "app.stats.contextMissingTooltip": "Context --",
    "app.selectSession": "Select a session from the sidebar",
    "app.getStarted": "Get Started",
    "app.getStartedStep1": "Select a project directory from the sidebar",
    "app.getStartedStep2Prefix": "Add models via the",
    "app.getStartedStep2Suffix": "button at the bottom",
    "app.noFileOpen": "No file open",
    "app.coreStarting": "Pi Core is starting",
    "app.hideFilePanel": "Hide file panel",
    "app.showFilePanel": "Show file panel",
    "sidebar.new": "New",
    "sidebar.newIn": "New session in {cwd}",
    "sidebar.selectProjectFirst": "Select a project first",
    "sidebar.dropFolder": "Drop folder to select project...",
    "sidebar.selectProject": "Select project...",
    "sidebar.useDefaultDirectory": "Use default directory",
    "sidebar.chooseFolder": "Choose folder...",
    "sidebar.customPath": "Custom path...",
    "sidebar.checking": "Checking...",
    "sidebar.pleaseDropFolder": "Please drop a folder.",
    "sidebar.folderPickerDesktop": "Folder picker is available in the desktop app. Type the path instead.",
    "sidebar.dragDesktop": "Folder drag-and-drop is available in the desktop app. Type the path instead.",
    "sidebar.noSessions": "No sessions found",
    "sidebar.loadingSessions": "Loading...",
    "sidebar.explorer": "Explorer",
    "sidebar.refreshExplorer": "Refresh explorer",
    "sidebar.deleteSession": "Delete \"{title}\"?",
    "sidebar.rename": "Rename",
    "sidebar.expandForks": "Expand forks",
    "sidebar.collapseForks": "Collapse forks",
    "sidebar.messages": "{count} msgs",
    "time.justNow": "just now",
    "time.minutesAgo": "{count}m ago",
    "time.hoursAgo": "{count}h ago",
    "time.daysAgo": "{count}d ago",
    "chat.loadingSession": "Loading session...",
    "chat.dropImages": "Drop images to attach",
    "chat.placeholder.steering": "Steer immediately / queue follow-up...",
    "chat.placeholder.running": "Agent is running...",
    "chat.placeholder.message": "Message...",
    "chat.retrying": "Retrying ({attempt}/{max})...",
    "chat.steer": "Steer",
    "chat.steerTitle": "Interrupt the current agent run and inject a message immediately",
    "chat.followUp": "Follow-up",
    "chat.followUpTitle": "Queue a message after the agent finishes",
    "chat.send": "Send",
    "chat.attachImage": "Attach image",
    "chat.thinkingTitle": "Change thinking level",
    "chat.toolsTitle": "Change tool preset",
    "chat.compact": "Compact",
    "chat.compacting": "Compacting...",
    "chat.compactTitle": "Compact context",
    "chat.stopCompactTitle": "Stop compaction",
    "chat.stop": "Stop",
    "chat.stopTitle": "Stop agent",
    "chat.soundOnTitle": "Turn completion sound off",
    "chat.soundOffTitle": "Turn completion sound on",
    "chat.thinking.auto": "Use pi default",
    "chat.thinking.off": "No reasoning",
    "chat.thinking.minimal": "Minimal reasoning",
    "chat.thinking.low": "Low reasoning",
    "chat.thinking.medium": "Medium reasoning",
    "chat.thinking.high": "High reasoning",
    "chat.thinking.xhigh": "Maximum reasoning",
    "chat.tools.off": "No tools, chat only",
    "chat.tools.default": "4 built-in tools",
    "chat.tools.full": "All built-in tools",
    "chat.phase.runningTool": "Running tool...",
    "chat.phase.runningOne": "Running {name}...",
    "chat.phase.runningMany": "Running {names}...",
    "chat.phase.runningMore": "Running {names} (+{count})...",
    "chat.phase.waitingModel": "Waiting for model...",
    "chat.phase.thinking": "Thinking...",
    "chat.hero.ready": "ready when you are.",
    "chat.hero.ask": "ask me anything.",
    "chat.hero.build": "let's build something cool.",
    "chat.hero.explore": "explore your codebase.",
    "chat.hero.email": "draft an email.",
    "chat.hero.paper": "summarize that paper.",
    "chat.hero.weekend": "plan your weekend.",
    "chat.hero.explain": "explain it like I'm five.",
    "chat.hero.pair": "pair-program with me.",
    "chat.hero.fix": "fix that tricky bug.",
    "chat.hero.translate": "translate to 中文.",
    "chat.hero.haiku": "write a haiku.",
    "chat.hero.brainstorm": "brainstorm ideas.",
    "chat.hero.review": "review my pull request.",
    "chat.hero.cook": "what should we cook tonight?",
    "chat.hero.ship": "ship it.",
    "chat.hero.pretty": "make it polished.",
    "chat.hero.duck": "talk it through with me.",
    "message.copyTitle": "Copy message",
    "message.editFromHere": "Edit from here",
    "message.editFromHereTitle": "Edit from here — branches within this session",
    "message.creating": "Creating...",
    "message.creatingSession": "Creating new session...",
    "message.newSession": "New session",
    "message.newSessionTitle": "New session — creates an independent copy from here",
    "message.estimatedTokens": "Estimated token count while streaming",
    "message.thinking": "Thinking",
    "message.noOutput": "(no output)",
    "branches.title": "Branches",
    "branches.noActiveSession": "No active session",
    "branches.noBranches": "This session has no branches",
    "toolPanel.off": "Off",
    "toolPanel.low": "Low",
    "toolPanel.high": "High",
    "toolPanel.noTools": "No tools",
    "toolPanel.noToolsEnabled": "No tools enabled",
    "toolPanel.noToolsDescription": "agent will not use any tools",
    "toolPanel.takesEffectNextTurn": "takes effect on next turn",
    "files.insertPath": "Insert path into chat",
    "files.mention": "mention",
    "files.empty": "empty",
    "files.loading": "Loading files...",
    "files.none": "No files found",
    "fileViewer.loading": "Loading...",
    "fileViewer.failedImage": "Failed to load image",
    "fileViewer.failedAudio": "Failed to load audio",
    "fileViewer.docxTooLarge": "DOCX too large for preview (>10MB)",
    "fileViewer.previewTitle": "Preview {name}",
    "fileViewer.liveSync": "Live sync active",
    "fileViewer.notWatching": "Not watching",
    "fileViewer.live": "live",
    "fileViewer.static": "static",
    "fileViewer.lines": "{count} lines",
    "fileViewer.unchangedLines": "{count} unchanged lines",
    "fileViewer.source": "Source",
    "fileViewer.diff": "Diff",
    "fileViewer.code": "Code",
    "fileViewer.wrap": "wrap",
    "fileViewer.enableWrap": "Enable word wrap",
    "fileViewer.disableWrap": "Disable word wrap",
    "fileViewer.htmlPreview": "HTML preview",
    "models.title": "Models",
    "models.searchPlaceholder": "Search providers...",
    "models.loading": "Loading...",
    "models.cancel": "Cancel",
    "models.delete": "Delete",
    "models.rename": "Rename",
    "models.networkError": "Network error",
    "models.verification": "Open the verification page and enter this code:",
    "models.addProvider": "Add provider",
    "models.addModel": "Add model",
    "models.selectProviderOrModel": "Select a provider or model",
    "models.noProvidersMatch": "No providers match",
    "models.custom": "Custom",
    "models.subscriptions": "Subscriptions",
    "models.customEndpoint": "Custom endpoint format",
    "models.modelCount": "{count} models",
    "models.testConnection": "Test model connection",
    "models.testing": "Testing model connection...",
    "models.connected": "Connected",
    "models.failed": "Failed",
    "models.hideApiKey": "Hide API key",
    "models.showApiKey": "Show API key",
    "models.subscription": "Subscription",
    "models.connectedLower": "connected",
    "models.notConnected": "not connected",
    "models.alreadyConnected": "Already connected. You can re-login or disconnect.",
    "models.connectAccount": "Connect your {name} account.",
    "models.openingBrowser": "Opening browser...",
    "models.completeSignin": "Complete sign-in in the browser, then copy the redirect URL from the address bar and paste it below.",
    "models.openLoginPagePrefix": "If the browser window did not open,",
    "models.openLoginPage": "click here to open the login page",
    "models.enterValue": "Enter value...",
    "models.submit": "Submit",
    "models.expiresIn": "Expires in {count} minutes.",
    "models.verifying": "Verifying...",
    "models.continuing": "Continuing...",
    "models.connectionLost": "Connection lost",
    "models.connectedSuccessfully": "Connected successfully.",
    "models.login": "Login",
    "models.relogin": "Re-login",
    "models.disconnect": "Disconnect",
    "models.removing": "Removing...",
    "models.apiKeyStored": "API key is stored. Enter a new key below to replace it, or disconnect to remove it.",
    "models.enterApiKey": "Enter your {name} API key to enable {count} models.",
    "models.enterNewKey": "Enter new key to replace...",
    "models.configured": "configured",
    "models.notConfigured": "not configured",
    "skills.title": "Skills",
    "skills.search": "Search",
    "skills.searching": "Searching...",
    "skills.loading": "Loading...",
    "skills.noSkillsFound": "No skills found",
    "skills.addSkill": "Add Skill",
    "skills.selectSkill": "Select a skill",
    "skills.name": "Name",
    "skills.description": "Description",
    "skills.searchPlaceholder": "e.g. react, testing, deploy",
    "skills.global": "Global",
    "skills.project": "Project",
    "skills.installing": "Installing...",
    "skills.visible": "Visible in model prompt — click to disable",
    "skills.hidden": "Hidden from model prompt — click to enable",
    "skills.browse": "Browse more skills at {site}.",
    "skills.discover": "Search {site} to discover and install skills for your agent.",
  },
  zh: {
    "common.appName": "Pi App",
    "common.cancel": "取消",
    "common.close": "关闭",
    "common.delete": "删除",
    "common.error": "错误",
    "common.loading": "加载中...",
    "common.open": "打开",
    "common.refresh": "刷新",
    "common.retry": "重试",
    "common.quit": "退出",
    "common.settings": "设置",
    "common.models": "模型",
    "common.skills": "技能",
    "common.update": "更新",
    "common.install": "安装",
    "common.installed": "已安装",
    "common.save": "保存",
    "common.saved": "已保存",
    "common.saving": "保存中...",
    "common.raw": "原文",
    "common.preview": "预览",
    "common.download": "下载",
    "common.noChanges": "没有变化",
    "common.copy": "复制",
    "common.copied": "已复制",
    "language.system": "跟随系统",
    "language.english": "English",
    "language.chinese": "中文",
    "language.section": "语言",
    "language.headerHelp": "选择 Pi App 使用的界面语言。",
    "language.title": "语言",
    "language.status": "正在使用{language}，来源：{source}。",
    "language.option.system.description": "使用当前 macOS、Windows 或浏览器语言。",
    "language.option.en.description": "使用英文界面。",
    "language.option.zh.description": "使用中文界面。",
    "language.preview": "预览",
    "language.preview.surface": "界面文本",
    "language.preview.action": "主要操作",
    "settings.appearance": "外观",
    "settings.appearanceHelp": "选择 Pi App 如何跟随浅色和深色模式。",
    "settings.piCoreHelp": "管理 Pi App 自有的本地运行时。",
    "settings.theme": "主题",
    "settings.themeStatus": "正在使用{theme}，来源：{source}。",
    "settings.theme.system": "跟随系统",
    "settings.theme.light": "浅色",
    "settings.theme.dark": "深色",
    "settings.theme.resolvedLight": "浅色",
    "settings.theme.resolvedDark": "深色",
    "settings.theme.sourceSystem": "系统",
    "settings.theme.option.system.description": "使用当前 macOS 或 Windows 外观。",
    "settings.theme.option.light.description": "使用明亮的工作区配色。",
    "settings.theme.option.dark.description": "使用低亮度工作区配色。",
    "settings.preview": "预览",
    "settings.preview.workspace": "工作区表面",
    "settings.preview.action": "主要操作",
    "core.status.missing": "未安装",
    "core.status.upToDate": "已是最新",
    "core.status.updateAvailable": "可更新",
    "core.status.unknown": "未知",
    "core.unavailable": "桌面运行时不可用。Pi Core 设置只在打包后的 Pi App 中可用。",
    "core.loadFailed": "加载 Pi Core 状态失败。",
    "core.checkingMessage": "正在从 npm 检查兼容的 Pi Core 最新版本...",
    "core.updatesAvailable": "发现兼容的 Pi Core 更新。",
    "core.alreadyLatest": "Pi Core 已是最新兼容版本。",
    "core.checkFailed": "检查 Pi Core 更新失败。",
    "core.updatingMessage": "正在更新 Pi Core 并重启本地服务...",
    "core.updatedMessage": "Pi Core 已更新，本地服务已重启。",
    "core.updateFailed": "更新 Pi Core 失败。",
    "core.runtime": "运行时",
    "core.runtimeHelp": "Pi Core 安装在打包应用外部。",
    "core.openRuntime": "打开运行时",
    "core.openLog": "打开日志",
    "core.runtimePath": "运行时路径",
    "core.nodeModules": "Node modules",
    "core.logFile": "日志文件",
    "core.packages": "包",
    "core.packagesHelp": "更新会保持在此 App 声明的兼容范围内。",
    "core.checkUpdates": "检查更新",
    "core.checking": "检查中...",
    "core.updateCore": "更新 Pi Core",
    "core.updating": "更新中...",
    "core.table.package": "包名",
    "core.table.range": "范围",
    "core.table.installed": "已安装",
    "core.table.latest": "最新版",
    "core.table.status": "状态",
    "core.loadingStatus": "正在加载 Pi Core 状态...",
    "startup.coreFailed": "Pi Core 设置失败",
    "startup.preparingCore": "正在准备 Pi Core",
    "startup.starting": "正在启动 Pi App...",
    "startup.runtimeUnavailable": "桌面运行时不可用",
    "startup.opening": "Pi App 正在打开...",
    "app.hideSidebar": "隐藏侧边栏",
    "app.showSidebar": "显示侧边栏",
    "app.exportHtml": "导出 HTML",
    "app.exportUnavailable": "会话保存后才能导出",
    "app.export": "导出",
    "app.system": "系统",
    "app.systemPromptEmpty": "系统提示为空（工具已禁用）",
    "app.systemPromptLoad": "系统提示尚未加载。",
    "app.systemPromptLoading": "正在加载系统提示...",
    "app.systemPromptError": "加载系统提示失败：{error}",
    "app.systemPromptNoSession": "会话保存后可以查看系统提示。",
    "app.systemPromptUnavailable": "系统提示暂不可用。",
    "app.systemPromptTooltip": "系统提示词",
    "app.stats.unknown": "未知",
    "app.stats.inputTooltip": "输入 {count}",
    "app.stats.inputPendingTooltip": "输入 --",
    "app.stats.outputTooltip": "输出 {count}",
    "app.stats.outputPendingTooltip": "输出 --",
    "app.stats.cacheReadTooltip": "缓存 {count}",
    "app.stats.cacheReadPendingTooltip": "缓存 --",
    "app.stats.costTooltip": "费用 {cost}",
    "app.stats.costPendingTooltip": "费用 --",
    "app.stats.contextTooltip": "上下文 {percent} · {used}/{window}",
    "app.stats.contextPendingTooltip": "上下文 --/{window}",
    "app.stats.contextMissingTooltip": "上下文 --",
    "app.selectSession": "从侧边栏选择一个会话",
    "app.getStarted": "开始使用",
    "app.getStartedStep1": "从侧边栏选择项目目录",
    "app.getStartedStep2Prefix": "通过底部的",
    "app.getStartedStep2Suffix": "按钮添加模型",
    "app.noFileOpen": "未打开文件",
    "app.coreStarting": "Pi Core 正在启动",
    "app.hideFilePanel": "隐藏文件面板",
    "app.showFilePanel": "显示文件面板",
    "sidebar.new": "新建",
    "sidebar.newIn": "在 {cwd} 中新建会话",
    "sidebar.selectProjectFirst": "请先选择项目",
    "sidebar.dropFolder": "拖放文件夹以选择项目...",
    "sidebar.selectProject": "选择项目...",
    "sidebar.useDefaultDirectory": "使用默认目录",
    "sidebar.chooseFolder": "选择文件夹...",
    "sidebar.customPath": "自定义路径...",
    "sidebar.checking": "检查中...",
    "sidebar.pleaseDropFolder": "请拖入文件夹。",
    "sidebar.folderPickerDesktop": "目录选择器只在桌面 App 中可用。请手动输入路径。",
    "sidebar.dragDesktop": "文件夹拖放只在桌面 App 中可用。请手动输入路径。",
    "sidebar.noSessions": "没有找到会话",
    "sidebar.loadingSessions": "加载中...",
    "sidebar.explorer": "文件",
    "sidebar.refreshExplorer": "刷新文件",
    "sidebar.deleteSession": "删除“{title}”？",
    "sidebar.rename": "重命名",
    "sidebar.expandForks": "展开分支",
    "sidebar.collapseForks": "折叠分支",
    "sidebar.messages": "{count} 条消息",
    "time.justNow": "刚刚",
    "time.minutesAgo": "{count} 分钟前",
    "time.hoursAgo": "{count} 小时前",
    "time.daysAgo": "{count} 天前",
    "chat.loadingSession": "正在加载会话...",
    "chat.dropImages": "拖放图片以添加",
    "chat.placeholder.steering": "立即插入 / 排队发送...",
    "chat.placeholder.running": "Agent 正在运行...",
    "chat.placeholder.message": "输入消息...",
    "chat.retrying": "正在重试（{attempt}/{max}）...",
    "chat.steer": "插入",
    "chat.steerTitle": "打断 Agent 当前运行，立即注入消息",
    "chat.followUp": "排队",
    "chat.followUpTitle": "在 Agent 完成后排队发送",
    "chat.send": "发送",
    "chat.attachImage": "添加图片",
    "chat.thinkingTitle": "切换推理强度",
    "chat.toolsTitle": "切换工具预设",
    "chat.compact": "压缩",
    "chat.compacting": "压缩中...",
    "chat.compactTitle": "压缩上下文",
    "chat.stopCompactTitle": "停止压缩",
    "chat.stop": "停止",
    "chat.stopTitle": "停止 Agent",
    "chat.soundOnTitle": "关闭完成提示音",
    "chat.soundOffTitle": "开启完成提示音",
    "chat.thinking.auto": "沿用 pi 默认设置",
    "chat.thinking.off": "关闭推理",
    "chat.thinking.minimal": "最少推理",
    "chat.thinking.low": "低强度推理",
    "chat.thinking.medium": "中等推理",
    "chat.thinking.high": "高强度推理",
    "chat.thinking.xhigh": "最高强度推理",
    "chat.tools.off": "无工具，纯聊天",
    "chat.tools.default": "4 项内置工具",
    "chat.tools.full": "全部内置工具",
    "chat.phase.runningTool": "正在运行工具...",
    "chat.phase.runningOne": "正在运行 {name}...",
    "chat.phase.runningMany": "正在运行 {names}...",
    "chat.phase.runningMore": "正在运行 {names}（+{count}）...",
    "chat.phase.waitingModel": "等待模型...",
    "chat.phase.thinking": "思考中...",
    "chat.hero.ready": "随时可以开始。",
    "chat.hero.ask": "问我任何问题。",
    "chat.hero.build": "一起做点酷东西。",
    "chat.hero.explore": "探索你的代码库。",
    "chat.hero.email": "起草一封邮件。",
    "chat.hero.paper": "总结那篇论文。",
    "chat.hero.weekend": "规划你的周末。",
    "chat.hero.explain": "像给五岁小孩一样解释。",
    "chat.hero.pair": "和我一起结对编程。",
    "chat.hero.fix": "修掉那个棘手 bug。",
    "chat.hero.translate": "翻译成 English。",
    "chat.hero.haiku": "写一首俳句。",
    "chat.hero.brainstorm": "一起头脑风暴。",
    "chat.hero.review": "审查我的 Pull Request。",
    "chat.hero.cook": "今晚吃什么？",
    "chat.hero.ship": "发版吧。",
    "chat.hero.pretty": "把它打磨好看。",
    "chat.hero.duck": "陪我把思路说清楚。",
    "message.copyTitle": "复制消息",
    "message.editFromHere": "从这里编辑",
    "message.editFromHereTitle": "从这里编辑，在当前会话内创建分支",
    "message.creating": "创建中...",
    "message.creatingSession": "正在创建新会话...",
    "message.newSession": "新会话",
    "message.newSessionTitle": "新会话，从这里创建一个独立副本",
    "message.estimatedTokens": "流式接收中的预估 token 数",
    "message.thinking": "思考",
    "message.noOutput": "（无输出）",
    "branches.title": "分支",
    "branches.noActiveSession": "没有活动会话",
    "branches.noBranches": "此会话没有分支",
    "toolPanel.off": "关闭",
    "toolPanel.low": "低",
    "toolPanel.high": "高",
    "toolPanel.noTools": "无工具",
    "toolPanel.noToolsEnabled": "未启用工具",
    "toolPanel.noToolsDescription": "Agent 不会使用任何工具",
    "toolPanel.takesEffectNextTurn": "下一轮生效",
    "files.insertPath": "插入路径到聊天",
    "files.mention": "引用",
    "files.empty": "空",
    "files.loading": "正在加载文件...",
    "files.none": "没有找到文件",
    "fileViewer.loading": "加载中...",
    "fileViewer.failedImage": "图片加载失败",
    "fileViewer.failedAudio": "音频加载失败",
    "fileViewer.docxTooLarge": "DOCX 过大，无法预览（>10MB）",
    "fileViewer.previewTitle": "预览 {name}",
    "fileViewer.liveSync": "实时同步已开启",
    "fileViewer.notWatching": "未监听",
    "fileViewer.live": "实时",
    "fileViewer.static": "静态",
    "fileViewer.lines": "{count} 行",
    "fileViewer.unchangedLines": "{count} 行未变化",
    "fileViewer.source": "源码",
    "fileViewer.diff": "差异",
    "fileViewer.code": "代码",
    "fileViewer.wrap": "换行",
    "fileViewer.enableWrap": "开启自动换行",
    "fileViewer.disableWrap": "关闭自动换行",
    "fileViewer.htmlPreview": "HTML 预览",
    "models.title": "模型",
    "models.searchPlaceholder": "搜索供应商...",
    "models.loading": "加载中...",
    "models.cancel": "取消",
    "models.delete": "删除",
    "models.rename": "重命名",
    "models.networkError": "网络错误",
    "models.verification": "打开验证页面并输入此代码：",
    "models.addProvider": "添加供应商",
    "models.addModel": "添加模型",
    "models.selectProviderOrModel": "选择供应商或模型",
    "models.noProvidersMatch": "没有匹配的供应商",
    "models.custom": "自定义",
    "models.subscriptions": "订阅",
    "models.customEndpoint": "自定义端点格式",
    "models.modelCount": "{count} 个模型",
    "models.testConnection": "测试模型连接",
    "models.testing": "正在测试模型连接...",
    "models.connected": "已连接",
    "models.failed": "失败",
    "models.hideApiKey": "隐藏 API Key",
    "models.showApiKey": "显示 API Key",
    "models.subscription": "订阅",
    "models.connectedLower": "已连接",
    "models.notConnected": "未连接",
    "models.alreadyConnected": "已连接。你可以重新登录或断开连接。",
    "models.connectAccount": "连接你的 {name} 账号。",
    "models.openingBrowser": "正在打开浏览器...",
    "models.completeSignin": "在浏览器中完成登录，然后复制地址栏中的重定向 URL 并粘贴到下方。",
    "models.openLoginPagePrefix": "如果浏览器窗口没有打开，",
    "models.openLoginPage": "点击这里打开登录页面",
    "models.enterValue": "输入内容...",
    "models.submit": "提交",
    "models.expiresIn": "{count} 分钟后过期。",
    "models.verifying": "正在验证...",
    "models.continuing": "继续中...",
    "models.connectionLost": "连接已断开",
    "models.connectedSuccessfully": "连接成功。",
    "models.login": "登录",
    "models.relogin": "重新登录",
    "models.disconnect": "断开连接",
    "models.removing": "断开连接中...",
    "models.apiKeyStored": "API key 已保存。在下方输入新 key 可替换，或断开连接以移除。",
    "models.enterApiKey": "输入你的 {name} API key 以启用 {count} 个模型。",
    "models.enterNewKey": "输入新 key 以替换...",
    "models.configured": "已配置",
    "models.notConfigured": "未配置",
    "skills.title": "技能",
    "skills.search": "搜索",
    "skills.searching": "搜索中...",
    "skills.loading": "加载中...",
    "skills.noSkillsFound": "没有找到技能",
    "skills.addSkill": "添加技能",
    "skills.selectSkill": "选择一个技能",
    "skills.name": "名称",
    "skills.description": "描述",
    "skills.searchPlaceholder": "例如 react、testing、deploy",
    "skills.global": "全局",
    "skills.project": "项目",
    "skills.installing": "安装中...",
    "skills.visible": "会出现在模型提示中，点击可禁用",
    "skills.hidden": "已从模型提示中隐藏，点击可启用",
    "skills.browse": "在 {site} 浏览更多技能。",
    "skills.discover": "搜索 {site}，为你的 Agent 发现并安装技能。",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

function isLanguageMode(value: string | null | undefined): value is LanguageMode {
  return value === "system" || value === "en" || value === "zh";
}

function resolveSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language?.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function readStoredMode(): LanguageMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(LANGUAGE_MODE_KEY);
    if (isLanguageMode(stored)) return stored;
  } catch {
    // Storage may be unavailable. Fall back to system.
  }
  return "system";
}

function resolveLanguage(mode: LanguageMode): ResolvedLanguage {
  return mode === "system" ? resolveSystemLanguage() : mode;
}

function applyLanguage(mode: LanguageMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveLanguage(mode);
  document.documentElement.lang = resolved === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.languageMode = mode;
  document.documentElement.dataset.language = resolved;
}

function getSnapshot(): LanguageSnapshot {
  const mode = readStoredMode();
  return `${mode}:${resolveLanguage(mode)}`;
}

function getServerSnapshot(): LanguageSnapshot {
  return "system:en";
}

function notify() {
  listeners.forEach((cb) => cb());
}

function writeLocalMode(mode: LanguageMode) {
  try {
    localStorage.setItem(LANGUAGE_MODE_KEY, mode);
  } catch {
    // The current document can still update even if storage fails.
  }
}

async function syncDesktopMode(mode: LanguageMode) {
  if (typeof window === "undefined") return;
  const resolved = resolveLanguage(mode);
  await window.piDesktop?.setLanguageMode?.(mode, resolved);
}

function setModeInternal(mode: LanguageMode, syncDesktop = true) {
  writeLocalMode(mode);
  applyLanguage(mode);
  notify();
  if (syncDesktop) {
    void syncDesktopMode(mode);
  }
}

function ensureInitialized() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  applyLanguage(readStoredMode());
  window.addEventListener("storage", (event) => {
    if (event.key !== LANGUAGE_MODE_KEY) return;
    applyLanguage(readStoredMode());
    notify();
  });
  window.addEventListener("languagechange", () => {
    if (readStoredMode() !== "system") return;
    applyLanguage("system");
    notify();
    void syncDesktopMode("system");
  });

  const desktop = window.piDesktop;
  if (desktop?.getLanguageMode && !desktopModeLoaded) {
    desktopModeLoaded = true;
    desktop.getLanguageMode()
      .then((mode) => {
        if (isLanguageMode(mode)) {
          setModeInternal(mode, false);
          void syncDesktopMode(mode);
        } else {
          void syncDesktopMode(readStoredMode());
        }
      })
      .catch(() => {
        void syncDesktopMode(readStoredMode());
      });
  }
}

function subscribe(cb: () => void): () => void {
  ensureInitialized();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function format(template: string, params?: Record<string, Primitive>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
}

export function getNextLanguageMode(mode: LanguageMode): LanguageMode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

export function useI18n() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { mode, resolvedLanguage } = useMemo(() => {
    const [modePart, resolvedPart] = snapshot.split(":") as [LanguageMode, ResolvedLanguage];
    return { mode: modePart, resolvedLanguage: resolvedPart };
  }, [snapshot]);

  const setMode = useCallback((nextMode: LanguageMode) => {
    ensureInitialized();
    setModeInternal(nextMode);
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, Primitive>) => {
    const dictionary = translations[resolvedLanguage];
    return format(dictionary[key] ?? translations.en[key] ?? key, params);
  }, [resolvedLanguage]);

  return {
    mode,
    resolvedLanguage,
    setMode,
    t,
  };
}
