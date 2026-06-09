# Desktop Development

This project uses Electron as a thin desktop shell around the existing Next.js app.
Pi Core is not bundled into the desktop app. Electron installs and updates Pi Core
inside the app user-data runtime with local npm.

## One-command Electron dev

```bash
npm run desktop:dev
```

This starts Electron, lets Electron install/check the app-owned Pi Core runtime,
then starts `next dev` on a random localhost port.

Use this when you are changing Electron startup, runtime install/update, menus, or
local service lifecycle behavior.

## Two-terminal UI dev

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run desktop:dev:attach
```

This keeps the normal Next.js dev server on port `30141` and opens Electron
against it. Use this when most of the work is renderer/UI code and you want normal
Next.js hot reload.

## Debugging

For Electron main-process debugging:

```bash
npm run desktop:dev:inspect
```

Or, when attaching Electron to an already-running Next dev server:

```bash
npm run desktop:dev:attach:inspect
```

Then attach a Node debugger to `127.0.0.1:9229` from VS Code or Chrome DevTools.
Main-process changes still require restarting Electron.

For renderer/UI debugging, use `npm run desktop:dev:attach`, then open Electron's
DevTools from `View > Toggle Developer Tools`. Renderer changes hot reload through
the Next dev server.

## Runtime and logs

macOS:

```text
~/Library/Application Support/Pi Agent Web/runtime
~/Library/Application Support/Pi Agent Web/desktop.log
```

Windows:

```text
%APPDATA%/Pi Agent Web/runtime
%APPDATA%/Pi Agent Web/desktop.log
```

The `Pi Core > Open Log File` menu item opens the startup log from the packaged
app. The `Pi Core > Open Runtime Folder` menu item opens the app-managed Core
runtime directory.

If Node/npm is installed through nvm, asdf, fnm, Volta, Homebrew, or a common
Windows Node installer location, Electron will try those paths even when launched
from Finder or Explorer.

## Smoke test before packaging

Run these before creating installers:

```bash
npm run lint
npm run typecheck
npm run build
npm run desktop:dev
```

Then build the platform package:

```bash
npm run desktop:pack:mac
npm run desktop:pack:win
```

Windows artifacts should be built on a Windows runner.
