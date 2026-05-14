#!/usr/bin/env node
/**
 * npm workspaces + npm ci often omit Rollup's optional @rollup/rollup-* native packages
 * (https://github.com/npm/cli/issues/4828). Install the binding for this OS/arch explicitly.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function rollupNativePackageName() {
  const { platform, arch } = process;
  if (platform === "darwin") {
    return arch === "arm64" ? "@rollup/rollup-darwin-arm64" : "@rollup/rollup-darwin-x64";
  }
  if (platform === "linux") {
    if (arch === "x64") return "@rollup/rollup-linux-x64-gnu";
    if (arch === "arm64") return "@rollup/rollup-linux-arm64-gnu";
  }
  if (platform === "win32") {
    return arch === "arm64" ? "@rollup/rollup-win32-arm64-msvc" : "@rollup/rollup-win32-x64-msvc";
  }
  return null;
}

function readRollupVersion() {
  const pkgPath = path.join(root, "node_modules", "rollup", "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  const v = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  return typeof v === "string" && v ? v : null;
}

function alreadyPresent(name) {
  try {
    const sub = name.split("/")[1];
    const p = path.join(root, "node_modules", "@rollup", sub, "package.json");
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

const name = rollupNativePackageName();
if (!name) {
  console.warn("ensure-rollup-native: skip (unsupported platform for auto-fix)");
  process.exit(0);
}

if (alreadyPresent(name)) {
  process.exit(0);
}

const version = readRollupVersion();
if (!version) {
  console.warn("ensure-rollup-native: skip (rollup not installed yet)");
  process.exit(0);
}

console.warn(`ensure-rollup-native: installing ${name}@${version} (npm optional-deps workaround)`);
execSync(`npm install ${name}@${version} --no-save --ignore-scripts --no-audit --no-fund`, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, npm_config_loglevel: "error" },
});
