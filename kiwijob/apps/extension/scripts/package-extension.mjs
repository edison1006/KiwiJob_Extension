import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(extensionRoot, "../..");
const distDir = path.join(extensionRoot, "dist");
const releasesDir = path.join(repositoryRoot, "releases");

const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, "manifest.json"), "utf8"));
if (packageJson.version !== manifest.version) {
  throw new Error(`Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
}

const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "page-sidebar.html",
  "page-sidebar.js",
  "assets/page-sidebar.css",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(distDir, relativePath))) {
    throw new Error(`Extension build is incomplete: missing ${relativePath}`);
  }
}

fs.mkdirSync(releasesDir, { recursive: true });
const artifact = path.join(releasesDir, `kiwijob-extension-${manifest.version}.zip`);
fs.rmSync(artifact, { force: true });
const result = spawnSync("zip", ["-qr", artifact, ".", "-x", "*.DS_Store"], {
  cwd: distDir,
  encoding: "utf8",
});
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "zip failed");
}

console.log(path.relative(repositoryRoot, artifact));
