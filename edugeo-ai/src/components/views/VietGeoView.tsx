"use client";

import { useCallback, useEffect, useState } from "react";
import { Pill } from "../shared/Ui";

// VietGeoAI section of EduGeo now embeds the whole legacy VietGeoAI app
// (React SPA + Express backend, port 8787) inside an <iframe>. On mount we
// health-check 8787; if nothing is listening we POST to /api/vietgeo/start-backend
// which auto-starts the backend as a child of the Next.js server (same singleton
// pattern as the NotebookLM 8020 auto-start) and waits until it answers.
//
// This file no longer renders its own map UI — the EduGeo /api/vietgeo/* routes
// and the DashboardView map card stay untouched.

// For local development this points at the child backend. When using ngrok,
// set NEXT_PUBLIC_VIETGEO_URL to the public 8787 tunnel URL so remote browsers
// can load the embedded legacy app as well.
const LEGACY_APP_URL = (process.env.NEXT_PUBLIC_VIETGEO_URL || "http://127.0.0.1:8787/").replace(/\/$/, "") + "/";

type EmbedState =
  | { status: "checking" }
  | { status: "starting" }
  | { status: "ready" }
  | { status: "error"; message: string };

async function healthCheck(timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${LEGACY_APP_URL}api/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function VietGeoView() {
  const [state, setState] = useState<EmbedState>({ status: "checking" });
  const [reloadKey, setReloadKey] = useState(0);

  const startBackend = useCallback(async () => {
    setState({ status: "starting" });
    try {
      const response = await fetch("/api/vietgeo/start-backend", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (await healthCheck(3000)) {
        setState({ status: "ready" });
      } else {
        throw new Error("Backend đã khởi động nhưng chưa phản hồi.");
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Không khởi động được VietGeoAI."
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: "checking" });
      if (await healthCheck()) {
        if (!cancelled) setState({ status: "ready" });
        return;
      }
      if (!cancelled) await startBackend();
    })();
    return () => {
      cancelled = true;
    };
  }, [startBackend, reloadKey]);

  return (
    <section className="view active">
      <div className="page-head admin-head vietgeo-hero">
        <div>
          <h1>VietGeoAI</h1>
          <p>Toàn bộ ứng dụng VietGeoAI cũ (bản đồ 34 tỉnh/thành 2025, tra cứu vị trí, chuyển địa danh, Quiz, Hỏi AI) chạy ngay trong đây.</p>
        </div>
        <Pill tone={state.status === "ready" ? "success" : state.status === "error" ? "danger" : "warn"}>
          {state.status === "ready" ? "Đang chạy" : state.status === "checking" ? "Đang kiểm tra" : state.status === "starting" ? "Đang khởi động" : "Lỗi"}
        </Pill>
      </div>

      <div className="vietgeo-embed-view">
        {state.status === "checking" && (
          <div className="vietgeo-embed-state">
            <div className="spinner" />
            <p>Đang kiểm tra máy chủ VietGeoAI…</p>
          </div>
        )}
        {state.status === "starting" && (
          <div className="vietgeo-embed-state">
            <div className="spinner" />
            <p>Đang khởi động máy chủ VietGeoAI (port 8787)…</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="vietgeo-embed-state">
            <p className="danger-text">{state.message}</p>
            <p>Bạn vẫn có thể mở ứng dụng trực tiếp ở tab mới.</p>
            <div className="vietgeo-embed-actions">
              <a className="btn primary" href={LEGACY_APP_URL} target="_blank" rel="noreferrer">Mở tab mới</a>
              <button className="btn" onClick={() => setReloadKey((key) => key + 1)}>Thử lại</button>
            </div>
          </div>
        )}
        {state.status === "ready" && (
          <iframe
            key={reloadKey}
            src={LEGACY_APP_URL}
            title="VietGeoAI"
            className="vietgeo-embed-iframe"
            allow="clipboard-write"
          />
        )}
      </div>
    </section>
  );
}
