/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("fs");
const path = require("path");

const CORE_PACKAGES = new Set([
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function inferPackageName(packagePath) {
  const afterNodeModules = packagePath.split("node_modules/").at(-1) || packagePath;
  const parts = afterNodeModules.split("/");
  return parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function dependencyNames(lockEntry) {
  return [
    ...Object.keys(lockEntry.dependencies ?? {}),
    ...Object.keys(lockEntry.optionalDependencies ?? {}),
  ];
}

function resolveDependencyPath(packages, parentPath, dependencyName) {
  let current = parentPath;
  while (current) {
    const nested = `${current}/node_modules/${dependencyName}`;
    if (packages[nested]) return nested;
    const idx = current.lastIndexOf("/node_modules/");
    if (idx === -1) break;
    current = current.slice(0, idx);
  }

  const root = `node_modules/${dependencyName}`;
  return packages[root] ? root : null;
}

function collectClosure(packages, rootNames) {
  const seenPaths = new Set();
  const seenNames = new Set();
  const stack = rootNames
    .map((name) => `node_modules/${name}`)
    .filter((packagePath) => packages[packagePath]);

  while (stack.length > 0) {
    const packagePath = stack.pop();
    if (!packagePath || seenPaths.has(packagePath)) continue;
    seenPaths.add(packagePath);

    const entry = packages[packagePath];
    const packageName = entry.name || inferPackageName(packagePath);
    if (packageName) seenNames.add(packageName);

    for (const dependencyName of dependencyNames(entry)) {
      const dependencyPath = resolveDependencyPath(packages, packagePath, dependencyName);
      if (dependencyPath && !seenPaths.has(dependencyPath)) {
        stack.push(dependencyPath);
      }
    }
  }

  return seenNames;
}

function getPackagedAppDir(context) {
  if (context.electronPlatformName === "darwin") {
    const productName = context.packager.appInfo.productFilename;
    return path.join(context.appOutDir, `${productName}.app`, "Contents", "Resources", "app");
  }
  return path.join(context.appOutDir, "resources", "app");
}

function removePackage(nodeModulesDir, packageName) {
  const packageDir = path.join(nodeModulesDir, ...packageName.split("/"));
  fs.rmSync(packageDir, { recursive: true, force: true });
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function removeCorePackages(nodeModulesDir, packageNames) {
  if (!fs.existsSync(nodeModulesDir)) return [];

  const removed = [];
  for (const packageName of packageNames) {
    removePackage(nodeModulesDir, packageName);
    removed.push(packageName);
  }
  return removed;
}

function trimPackagedPackageMetadata(appDir, rootPackage) {
  const packagePath = path.join(appDir, "package.json");
  const packageJson = readJson(packagePath);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    delete packageJson[field];
  }
  packageJson.piCore = rootPackage.piCore;
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

module.exports = async function afterPack(context) {
  const projectDir = context.packager.info.projectDir;
  const rootPackage = readJson(path.join(projectDir, "package.json"));
  const lock = readJson(path.join(projectDir, "package-lock.json"));
  const packages = lock.packages ?? {};

  const rootDependencies = Object.keys(rootPackage.dependencies ?? {});
  const nonCoreRoots = rootDependencies.filter((name) => !CORE_PACKAGES.has(name));
  const coreRoots = rootDependencies.filter((name) => CORE_PACKAGES.has(name));
  const coreClosure = collectClosure(packages, coreRoots);
  const nonCoreClosure = collectClosure(packages, nonCoreRoots);

  const appDir = getPackagedAppDir(context);
  trimPackagedPackageMetadata(appDir, rootPackage);
  copyDirectory(
    path.join(appDir, ".next", "static"),
    path.join(appDir, ".next", "standalone", ".next", "static"),
  );
  copyDirectory(
    path.join(appDir, "public"),
    path.join(appDir, ".next", "standalone", "public"),
  );

  const coreOnlyPackages = [...coreClosure].filter((packageName) => !nonCoreClosure.has(packageName));
  const removed = [
    ...removeCorePackages(path.join(appDir, "node_modules"), coreOnlyPackages),
    ...removeCorePackages(path.join(appDir, ".next", "standalone", "node_modules"), coreOnlyPackages),
  ];

  if (removed.length > 0) {
    console.log(`[desktop] pruned ${removed.length} Pi Core runtime packages from packaged app`);
  }
};
