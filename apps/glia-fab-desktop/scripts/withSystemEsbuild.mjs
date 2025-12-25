import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

function findSystemEsbuildPath() {
  const candidates = [
    process.env.ESBUILD_SYSTEM_PATH,
    "/opt/homebrew/bin/esbuild",
    "/usr/local/bin/esbuild",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const locator = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(locator, ["esbuild"], { encoding: "utf8" });
  if (found.status === 0) {
    const firstLine = found.stdout.split("\n").map((l) => l.trim()).filter(Boolean)[0];
    if (firstLine) return firstLine;
  }

  return null;
}

function getBinaryVersion(binaryPath) {
  const result = spawnSync(binaryPath, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function canRunWorkspaceEsbuild() {
  const require = createRequire(import.meta.url);
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve("esbuild/package.json");
  } catch {
    return true;
  }

  const workspaceBinary = path.join(path.dirname(pkgJsonPath), "bin", "esbuild");
  if (!fs.existsSync(workspaceBinary)) return true;

  const probe = spawnSync(workspaceBinary, ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

function getWorkspaceEsbuildVersion() {
  const require = createRequire(import.meta.url);
  try {
    return require("esbuild/package.json").version;
  } catch {
    return null;
  }
}

function run(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    if (typeof code === "number") process.exit(code);
    process.exit(signal ? 1 : 0);
  });
  child.on("error", () => process.exit(1));
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/withSystemEsbuild.mjs <command> [...args]");
  process.exit(1);
}

if (!process.env.ESBUILD_BINARY_PATH) {
  const workspaceVersion = getWorkspaceEsbuildVersion();
  const systemPath = findSystemEsbuildPath();
  const systemVersion = systemPath ? getBinaryVersion(systemPath) : null;

  if (systemPath && workspaceVersion && systemVersion === workspaceVersion) {
    process.env.ESBUILD_BINARY_PATH = systemPath;
  } else if (systemPath) {
    if (!canRunWorkspaceEsbuild()) {
      if (workspaceVersion && systemVersion && systemVersion !== workspaceVersion) {
        console.warn(
          `[shell] Workspace esbuild is blocked; using system esbuild ${systemVersion} (workspace wants ${workspaceVersion}).`,
        );
      }
      process.env.ESBUILD_BINARY_PATH = systemPath;
    }
  } else if (!canRunWorkspaceEsbuild()) {
    console.error(
      "[shell] Workspace esbuild is blocked and no system esbuild was found. Install it (macOS): `brew install esbuild`, or set ESBUILD_BINARY_PATH.",
    );
    process.exit(1);
  }
}

run(args[0], args.slice(1));
