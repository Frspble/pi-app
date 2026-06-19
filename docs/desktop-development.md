# Desktop Development

This project uses Electron as a thin desktop shell around the existing Next.js app.
Pi Core is not bundled into the desktop app. Electron installs and updates Pi Core
inside the app user-data runtime with the packaged npm CLI and Electron's Node
runtime, then runs it in a separate local Node service. Packaged apps do not
require a system Node.js installation. The Next.js process stays focused on the
UI and proxies Core APIs to that service.

## One-command Electron dev

```bash
npm run desktop:dev
```

This starts Electron, lets Electron install/check the app-owned Pi Core runtime,
starts the Pi Core service, then starts `next dev` on a random localhost port.

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
Next.js hot reload. Electron still owns the Pi Core service; the dev server reads
the service endpoint from the app user-data directory.

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
~/Library/Application Support/PiApp/runtime
~/Library/Application Support/PiApp/core-service.json
~/Library/Application Support/PiApp/desktop.log
```

Windows:

```text
%APPDATA%/PiApp/runtime
%APPDATA%/PiApp/core-service.json
%APPDATA%/PiApp/desktop.log
```

The `Pi Core > Open Log File` menu item opens the startup log from the packaged
app. The `Pi Core > Open Runtime Folder` menu item opens the app-managed Core
runtime directory.

Runtime layout:

```text
runtime/
  node_modules/          # the only Pi Core dependency install
  package.json
  package-lock.json
  standalone/            # copied Next.js standalone server, without Pi Core
  .staging/<id>/         # temporary npm install target during updates
  .rollback/<id>/        # temporary backup while replacing runtime packages
```

Core updates install into `.staging` first. Electron stops only the Pi Core
service, swaps the staged runtime into place, starts the service again, and rolls
back if the health check fails. The UI/Next service does not need to restart for
Pi Core updates.

Packaged apps prefer the npm CLI copied into `resources/bundled-npm`. Development
builds use the project-local npm package and can fall back to a system npm when
explicitly overridden with `PI_WEB_NPM`. Pi Core network operations use
`https://registry.npmmirror.com` by default and retry against
`https://registry.npmjs.org` if the mirror fails. Set `PI_APP_NPM_REGISTRY` and
`PI_APP_NPM_FALLBACK_REGISTRY` to override those endpoints while debugging.

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
