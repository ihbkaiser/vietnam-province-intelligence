#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "..");
const notebookRoot = process.env.NOTEBOOKLM_ROOT || resolve(repoRoot, "notebooklm");
const notebookUrl = process.env.NOTEBOOKLM_HTTP_URL || "http://127.0.0.1:8020";
const vietGeoRoot = process.env.VIETGEO_ROOT || resolve(repoRoot, "backend");
const vietGeoPort = process.env.VIETGEOAI_PORT || "8787";
const vietGeoUrl = process.env.VIETGEO_API_BASE || `http://127.0.0.1:${vietGeoPort}`;
const pythonBin = process.env.PYTHON_BIN || process.env.PYTHON || "python";
const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3020";
const mode = process.argv[2] === "start" ? "start" : "dev";

let notebookProcess = null;
let vietGeoProcess = null;

async function isNotebookReady(timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${notebookUrl}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startNotebook() {
  mkdirSync(resolve(notebookRoot, ".logs"), { recursive: true });
  const out = createWriteStream(resolve(notebookRoot, ".logs", "serve-8020.out.log"), { flags: "a" });
  const err = createWriteStream(resolve(notebookRoot, ".logs", "serve-8020.err.log"), { flags: "a" });
  notebookProcess = spawn(
    pythonBin,
    ["scripts/serve.py", "--config", "config.yaml", "--host", "127.0.0.1", "--port", "8020"],
    {
      cwd: notebookRoot,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  notebookProcess.stdout.pipe(out);
  notebookProcess.stderr.pipe(err);
  notebookProcess.on("exit", (code) => {
    if (code) console.warn(`[EduGeo] NotebookLM exited with code ${code}.`);
  });
}

async function isVietGeoReady(timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${vietGeoUrl.replace(/\/$/, "")}/api/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function findTsxCli(fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = resolve(dir, "node_modules", "tsx", "dist", "cli.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
}

function startVietGeo() {
  const tsxCli = findTsxCli(vietGeoRoot);
  if (!tsxCli || !existsSync(resolve(vietGeoRoot, "src", "server.ts"))) {
    console.warn("[EduGeo] VietGeoAI backend source/tsx not found; port 8787 was not started.");
    return null;
  }
  vietGeoProcess = spawn(process.execPath, [tsxCli, "src/server.ts"], {
    cwd: vietGeoRoot,
    env: { ...process.env, PORT: String(vietGeoPort), NODE_ENV: process.env.NODE_ENV || "production" },
    stdio: "inherit",
    windowsHide: true
  });
  vietGeoProcess.on("exit", (code) => {
    if (code) console.warn(`[EduGeo] VietGeoAI backend exited with code ${code}.`);
  });
  return vietGeoProcess;
}

async function ensureVietGeo() {
  if (await isVietGeoReady()) {
    console.log(`[EduGeo] VietGeoAI backend is ready at ${vietGeoUrl}.`);
    return;
  }
  console.log(`[EduGeo] Starting VietGeoAI backend at ${vietGeoUrl}...`);
  if (!startVietGeo()) return;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isVietGeoReady()) {
      console.log("[EduGeo] VietGeoAI backend is ready.");
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  console.warn("[EduGeo] VietGeoAI backend did not become ready within 60s.");
}

async function ensureNotebook() {
  if (await isNotebookReady()) {
    console.log(`[EduGeo] NotebookLM is ready at ${notebookUrl}.`);
    return;
  }
  console.log(`[EduGeo] Starting NotebookLM at ${notebookUrl}...`);
  startNotebook();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await isNotebookReady()) {
      console.log("[EduGeo] NotebookLM is ready.");
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  console.warn("[EduGeo] NotebookLM did not become ready within 90s. EduGeo will still start and retry lazily.");
}

function stopNotebook() {
  if (notebookProcess && !notebookProcess.killed) {
    notebookProcess.kill();
  }
}

function stopVietGeo() {
  if (vietGeoProcess && !vietGeoProcess.killed) vietGeoProcess.kill();
}

process.on("SIGINT", () => {
  stopNotebook();
  stopVietGeo();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopNotebook();
  stopVietGeo();
  process.exit(143);
});
process.on("exit", () => {
  stopNotebook();
  stopVietGeo();
});

await ensureNotebook();
await ensureVietGeo();

const nextCli = resolve(appRoot, "node_modules", "next", "dist", "bin", "next");
const nextArgs = [nextCli, mode, "--hostname", host, "--port", port];
const nextProcess = spawn(process.execPath, nextArgs, {
  cwd: appRoot,
  env: { ...process.env, NOTEBOOKLM_HTTP_URL: notebookUrl },
  stdio: "inherit",
  windowsHide: true
});

nextProcess.on("exit", (code, signal) => {
  stopNotebook();
  stopVietGeo();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
