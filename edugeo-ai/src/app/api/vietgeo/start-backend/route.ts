import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ok } from "@/server/http";

// Auto-start the legacy VietGeoAI Express backend (port 8787) so the VietGeoAI
// section of EduGeo can embed the old app inside an <iframe>.
//
// Same pattern as the NotebookLM 8020 auto-start in notebookBridge.ts: a cheap
// /api/health check first; if nothing is listening on 8787, spawn the backend
// (`npx tsx src/server.ts` in ../backend) as a child process and wait until it
// answers before returning. Concurrent callers share the same start promise so
// we never launch two servers.

const LEGACY_ROOT = path.resolve(process.cwd(), "..", "backend");
const LEGACY_PORT = Number(process.env.VIETGEOAI_PORT || 8787);
const LEGACY_HEALTH = `http://127.0.0.1:${LEGACY_PORT}/api/health`;

// Resolve the tsx CLI that runs the legacy backend. In this monorepo tsx is
// hoisted into the repo-root node_modules (outside the Next.js app dir, so it
// can't be require()'d from here) — walk up from the backend dir looking for
// node_modules/tsx/dist/cli.mjs, then spawn `node <cli> src/server.ts`.
// Spawning node directly avoids Windows `spawn EINVAL` when spawning a .cmd.
function findTsxCli(fromDir: string): string {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", "tsx", "dist", "cli.mjs");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
}
const TSX_CLI = findTsxCli(LEGACY_ROOT);

async function isLegacyBackendUp(timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(LEGACY_HEALTH, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startLegacyBackend(): Promise<boolean> {
  if (!TSX_CLI) {
    console.warn("VietGeoAI auto-start: could not resolve tsx CLI for the legacy backend.");
    return Promise.resolve(false);
  }
  const child = spawn(process.execPath, [TSX_CLI, "src/server.ts"], {
    cwd: LEGACY_ROOT,
    env: { ...process.env, PORT: String(LEGACY_PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  child.on("error", (error) => {
    console.warn("VietGeoAI auto-start spawn error:", error.message);
  });

  // tsx watch keeps running; we only need /api/health to come up.
  const deadline = Date.now() + 60_000;
  const waitReady = async (): Promise<boolean> => {
    if (await isLegacyBackendUp(1200)) return true;
    if (Date.now() > deadline) {
      console.warn("VietGeoAI auto-start: backend not ready within 60s.");
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    return waitReady();
  };
  return waitReady();
}

async function ensureLegacyBackend(): Promise<boolean> {
  if (await isLegacyBackendUp()) return true;
  if (!startPromise) {
    console.log("VietGeoAI backend (port 8787) not running — auto-starting…");
    startPromise = startLegacyBackend().finally(() => {
      startPromise = null;
    });
  }
  return startPromise;
}

let startPromise: Promise<boolean> | null = null;

export async function POST() {
  const ready = await ensureLegacyBackend();
  if (!ready) {
    return Response.json({ ok: false, error: "VietGeoAI backend (port 8787) could not be started." }, { status: 502 });
  }
  return ok({ ok: true, url: "http://127.0.0.1:8787/" });
}
